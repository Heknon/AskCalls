import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

interface ModelsStackProps extends StackProps {
  bucketName: string;
  /** Optional custom domain (e.g. `models.askcalls.com`) and its us-east-1 ACM certificate. */
  domainName?: string;
  certificateArn?: string;
}

/**
 * The embedding-model host (`EMBEDDING_MODEL_URL`, scripts/models/README.md): a private bucket
 * that only CloudFront reads, through origin access control.
 *
 * The files are public model weights, and browsers and the agent check every file's SHA-256
 * against the pins in the app before using it, so CORS allows GET/HEAD from any origin (preview
 * URLs are random). `models:publish` writes each object once at a content-hashed key with
 * `Cache-Control: public, max-age=31536000, immutable` and `Content-Encoding: gzip`; the cache
 * policy honors that header (max TTL one year), and CloudFront passes the gzip through.
 */
export class ModelsStack extends Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: ModelsStackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      // Builds are only ever added at new keys; nothing to version.
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'abort-incomplete-multipart-uploads',
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
    });

    // The origin's Cache-Control decides (min TTL 0); without one, a day. No headers, cookies
    // or query strings in the key. Accept-Encoding normalization also lets CloudFront compress
    // anything the origin didn't already gzip.
    const cachePolicy = new cloudfront.CachePolicy(this, 'CachePolicy', {
      cachePolicyName: 'askcalls-models-immutable',
      comment: 'Honors the immutable Cache-Control models:publish sets',
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.days(1),
      maxTtl: Duration.days(365),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeaders', {
      responseHeadersPolicyName: 'askcalls-models-cors',
      comment: 'CORS GET/HEAD from any origin; files are public and SHA-256 pinned',
      corsBehavior: {
        accessControlAllowOrigins: ['*'],
        accessControlAllowMethods: ['GET', 'HEAD'],
        accessControlAllowHeaders: ['*'],
        accessControlExposeHeaders: ['Content-Length', 'Content-Encoding'],
        accessControlAllowCredentials: false,
        accessControlMaxAge: Duration.days(1),
        originOverride: true,
      },
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(730),
          includeSubdomains: false,
          override: true,
        },
      },
    });

    const custom =
      props.domainName && props.certificateArn
        ? {
            domainNames: [props.domainName],
            certificate: acm.Certificate.fromCertificateArn(
              this,
              'Certificate',
              props.certificateArn,
            ),
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
          }
        : {};

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'askcalls-models (embedding model, EMBEDDING_MODEL_URL)',
      // North America, Europe and Israel.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      ...custom,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
          originAccessLevels: [cloudfront.AccessLevel.READ],
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // The worker's fetches are simple GETs (no preflight).
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy,
        responseHeadersPolicy,
        compress: true,
      },
    });

    const host = props.domainName ?? this.distribution.distributionDomainName;
    new CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
    new CfnOutput(this, 'DistributionDomain', {
      value: this.distribution.distributionDomainName,
    });
    // EMBEDDING_MODEL_URL, and MODELS_PUBLIC_URL for models:publish's read-back check.
    new CfnOutput(this, 'ModelsUrl', { value: `https://${host}` });
  }
}
