import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
// The adapter's CORS rules are the single source of truth: the bucket gets exactly what
// `corsJson(origins)` documents and `checkBucketCors` checks. Relative import, like scripts/:
// infra/ is not a workspace, and the adapter resolves the AWS SDK from its own node_modules.
import { corsRules } from '../../packages/adapters/blob-s3/src/cors';
import { type DeployEnv, PREVIEW_EXPIRY_DAYS, PREVIEW_PREFIX } from './config';

interface StorageStackProps extends StackProps {
  deployEnv: DeployEnv;
  bucketName: string;
  /** Origins the browser PUTs and GETs encrypted recordings from (presigned URLs need CORS). */
  appOrigins: string[];
}

/** CDK's CORS rule shape for the adapter's S3 `CORSRules`. */
export function bucketCors(origins: string[]): s3.CorsRule[] {
  return corsRules(origins).map((rule) => ({
    allowedOrigins: rule.AllowedOrigins ?? [],
    allowedMethods: (rule.AllowedMethods ?? []) as s3.HttpMethods[],
    allowedHeaders: rule.AllowedHeaders ?? [],
    exposedHeaders: rule.ExposeHeaders ?? [],
    ...(rule.MaxAgeSeconds !== undefined && { maxAge: rule.MaxAgeSeconds }),
  }));
}

/**
 * One environment's recordings bucket (`askcalls-<env>`) and the IAM user the app on Vercel
 * signs with. The bucket only ever holds ciphertext: segments encrypted on the device, which
 * the server can't read.
 *
 * - Private: public access blocked, ACLs disabled, TLS 1.2+ only (bucket policy).
 * - SSE-S3 at rest. KMS would add nothing here: the objects are already end-to-end encrypted
 *   with keys AWS never holds, and SSE-KMS bills every presigned GET and PUT.
 * - Versioning off: a deleted recording (retention purge, call or account deletion) must be
 *   gone, not kept as a noncurrent version. Previous versions would also outlive the user's
 *   retention setting for no gain, since a ciphertext segment is never rewritten in place.
 * - Recordings move to S3 Intelligent-Tiering on upload: old calls are rarely replayed, so they
 *   drift to the infrequent (30 days) and archive-instant (90 days) tiers and come back on play,
 *   with no retrieval fee or minimum duration. Objects under 128 KB stay in the frequent tier.
 * - Dev only: `preview/` objects expire after 14 days, behind the PR-close cleanup.
 */
export class StorageStack extends Stack {
  readonly bucket: s3.Bucket;
  readonly appUser: iam.User;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);
    const { deployEnv } = props;

    const lifecycleRules: s3.LifecycleRule[] = [
      {
        id: 'abort-incomplete-multipart-uploads',
        abortIncompleteMultipartUploadAfter: Duration.days(1),
      },
      {
        id: 'intelligent-tiering',
        transitions: [
          { storageClass: s3.StorageClass.INTELLIGENT_TIERING, transitionAfter: Duration.days(0) },
        ],
      },
    ];
    if (deployEnv === 'dev') {
      lifecycleRules.push({
        id: 'expire-preview-objects',
        prefix: PREVIEW_PREFIX,
        expiration: Duration.days(PREVIEW_EXPIRY_DAYS),
      });
    }

    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // ACLs off: only IAM policies grant access, never a per-object ACL.
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      versioned: false,
      // Recordings are user data: deleting the stack must never delete them.
      removalPolicy: RemovalPolicy.RETAIN,
      cors: bucketCors(props.appOrigins),
      lifecycleRules,
    });

    // Vercel holds this user's access key (created by hand, docs/deployment.md); it may touch
    // this bucket's objects only. ListBucket: deletePrefix pages with ListObjectsV2, the health
    // check sends HeadBucket, and a missing object reads as 404 rather than 403.
    // GetBucketCORS: /admin's CORS check (checkBucketCors).
    this.appUser = new iam.User(this, 'AppUser', { userName: `askcalls-app-${deployEnv}` });
    this.appUser.attachInlinePolicy(
      new iam.Policy(this, 'AppUserPolicy', {
        policyName: `askcalls-${deployEnv}-bucket`,
        statements: [
          new iam.PolicyStatement({
            actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
            resources: [this.bucket.arnForObjects('*')],
          }),
          new iam.PolicyStatement({
            actions: ['s3:ListBucket', 's3:GetBucketCORS'],
            resources: [this.bucket.bucketArn],
          }),
        ],
      }),
    );

    new CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
    // The access key is created by hand and goes straight into Vercel; never a stack output.
    new CfnOutput(this, 'AppUserName', { value: this.appUser.userName });
  }
}
