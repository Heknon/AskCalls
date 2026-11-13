import { readFileSync } from 'node:fs';
import { App, type Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { corsRules } from '../../packages/adapters/blob-s3/src/cors';
import { buildStacks } from '../lib/app';
import { DEPLOY_ENVS, type DeployEnv } from '../lib/config';

const ACCOUNT = '000000000000';
const cdkJson = JSON.parse(readFileSync(new URL('../cdk.json', import.meta.url), 'utf8')) as {
  context: Record<string, unknown>;
};

function synth(extra: Record<string, unknown> = {}) {
  process.env.CDK_DEFAULT_ACCOUNT = ACCOUNT;
  return buildStacks(new App({ context: { ...cdkJson.context, ...extra } }));
}

const template = (stack: Stack) => Template.fromStack(stack);

/** Every IAM statement's resources, flattened, as JSON (CloudFormation intrinsics included). */
function statements(t: Template, type: 'AWS::IAM::Policy') {
  return Object.values(t.findResources(type)).flatMap(
    (r) => (r.Properties.PolicyDocument.Statement as Record<string, unknown>[]) ?? [],
  );
}

let stacks: ReturnType<typeof synth>;
beforeAll(() => {
  stacks = synth();
});

describe('config (cdk.json)', () => {
  it('is in Frankfurt for this repository', () => {
    expect(stacks.config.region).toBe('eu-central-1');
    expect(stacks.config.githubRepo).toBe('Heknon/AskCalls');
    expect(stacks.config.buckets).toEqual({ prod: 'askcalls-prod', dev: 'askcalls-dev' });
    expect(stacks.config.appOrigins.prod).toEqual(['https://askcalls.com']);
  });

  it('pairs the models domain with a us-east-1 certificate', () => {
    expect(() =>
      synth({
        'askcalls:modelsDomain': 'models.askcalls.com',
        'askcalls:modelsCertificateArn': '',
      }),
    ).toThrow(/together/);
    expect(() =>
      synth({
        'askcalls:modelsDomain': 'models.askcalls.com',
        'askcalls:modelsCertificateArn': `arn:aws:acm:eu-central-1:${ACCOUNT}:certificate/x`,
      }),
    ).toThrow(/us-east-1/);
  });
});

describe.each(DEPLOY_ENVS)('AskCallsStorage-%s', (env: DeployEnv) => {
  let t: Template;
  beforeAll(() => {
    t = template(stacks.storage[env]);
  });

  it('has one private, encrypted, unversioned bucket', () => {
    t.resourceCountIs('AWS::S3::Bucket', 1);
    t.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      Properties: {
        BucketName: `askcalls-${env}`,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
          ],
        },
        VersioningConfiguration: Match.absent(),
      },
    });
  });

  it('denies every request without TLS 1.2+', () => {
    t.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Action: 's3:*',
            Principal: { AWS: '*' },
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
          Match.objectLike({
            Effect: 'Deny',
            Condition: { NumericLessThan: { 's3:TlsVersion': 1.2 } },
          }),
        ]),
      },
    });
    // Nothing in the bucket policy grants access: only the IAM user's policy does.
    const policy = Object.values(t.findResources('AWS::S3::BucketPolicy'))[0]!;
    for (const s of policy.Properties.PolicyDocument.Statement) expect(s.Effect).toBe('Deny');
  });

  it("has exactly blob-s3's CORS rules for the environment's origins", () => {
    const bucket = Object.values(t.findResources('AWS::S3::Bucket'))[0]!;
    const expected = corsRules(stacks.config.appOrigins[env]).map((r) => ({
      AllowedOrigins: r.AllowedOrigins,
      AllowedMethods: r.AllowedMethods,
      AllowedHeaders: r.AllowedHeaders,
      ExposedHeaders: r.ExposeHeaders,
      MaxAge: r.MaxAgeSeconds,
    }));
    expect(bucket.Properties.CorsConfiguration.CorsRules).toEqual(expected);
    expect(expected[0]).toMatchObject({
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      AllowedHeaders: ['content-type'],
      ExposedHeaders: ['ETag', 'Content-Length'],
    });
  });

  it('moves recordings to Intelligent-Tiering on upload', () => {
    const bucket = Object.values(t.findResources('AWS::S3::Bucket'))[0]!;
    const rules = bucket.Properties.LifecycleConfiguration.Rules as Record<string, unknown>[];
    expect(rules).toContainEqual({
      Id: 'intelligent-tiering',
      Transitions: [{ StorageClass: 'INTELLIGENT_TIERING', TransitionInDays: 0 }],
      Status: 'Enabled',
    });
  });

  it('aborts incomplete multipart uploads; dev also expires preview objects', () => {
    const bucket = Object.values(t.findResources('AWS::S3::Bucket'))[0]!;
    const rules = bucket.Properties.LifecycleConfiguration.Rules as Record<string, unknown>[];
    expect(rules).toContainEqual({
      Id: 'abort-incomplete-multipart-uploads',
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
      Status: 'Enabled',
    });
    const preview = { Id: 'expire-preview-objects', Prefix: 'preview/', ExpirationInDays: 14 };
    if (env === 'dev') expect(rules).toContainEqual({ ...preview, Status: 'Enabled' });
    else expect(rules.some((r) => r.Id === preview.Id || r.ExpirationInDays)).toBe(false);
  });

  it("scopes the app user's policy to this bucket only", () => {
    t.hasResourceProperties('AWS::IAM::User', { UserName: `askcalls-app-${env}` });
    t.resourceCountIs('AWS::IAM::AccessKey', 0);
    const bucketRef = { 'Fn::GetAtt': [Match.stringLikeRegexp('^Bucket'), 'Arn'] };
    const all = statements(t, 'AWS::IAM::Policy');
    expect(all).toHaveLength(2);
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: ['s3:DeleteObject', 's3:GetObject', 's3:PutObject'],
            Resource: { 'Fn::Join': ['', [bucketRef, '/*']] },
          },
          {
            Effect: 'Allow',
            Action: ['s3:GetBucketCORS', 's3:ListBucket'],
            Resource: bucketRef,
          },
        ],
      },
    });
  });

  it('outputs names, never keys', () => {
    const outputs = Object.keys(t.findOutputs('*'));
    expect(outputs.sort()).toEqual(['AppUserName', 'BucketName']);
  });
});

describe('AskCallsModels', () => {
  let t: Template;
  beforeAll(() => {
    t = template(stacks.models);
  });

  it('keeps the bucket private and encrypted', () => {
    t.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      Properties: {
        BucketName: 'askcalls-models',
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
          ],
        },
      },
    });
  });

  it('lets only this distribution read it, through origin access control', () => {
    t.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    t.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: {
        OriginAccessControlOriginType: 's3',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4',
      },
    });
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Origins: [
          Match.objectLike({
            OriginAccessControlId: { 'Fn::GetAtt': [Match.anyValue(), 'Id'] },
            S3OriginConfig: { OriginAccessIdentity: '' },
          }),
        ],
      },
    });
    const policy = Object.values(t.findResources('AWS::S3::BucketPolicy'))[0]!;
    const all = policy.Properties.PolicyDocument.Statement as Record<string, unknown>[];
    expect(all.filter((s) => s.Effect === 'Deny').map((s) => s.Condition)).toEqual([
      { Bool: { 'aws:SecureTransport': 'false' } },
      { NumericLessThan: { 's3:TlsVersion': 1.2 } },
    ]);
    const allows = all.filter((s) => s.Effect === 'Allow');
    expect(allows).toEqual([
      expect.objectContaining({
        Action: 's3:GetObject',
        Principal: { Service: 'cloudfront.amazonaws.com' },
        Condition: {
          StringEquals: {
            'AWS:SourceArn': {
              'Fn::Join': [
                '',
                expect.arrayContaining([
                  ':cloudfront::',
                  { Ref: expect.stringMatching(/^Distribution/) },
                ]),
              ],
            },
          },
        },
      }),
    ]);
  });

  it('honors the immutable Cache-Control, compresses, and serves GET/HEAD over HTTPS', () => {
    t.hasResourceProperties('AWS::CloudFront::CachePolicy', {
      CachePolicyConfig: {
        MinTTL: 0,
        MaxTTL: 31536000,
        ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({
          EnableAcceptEncodingGzip: true,
          EnableAcceptEncodingBrotli: true,
          HeadersConfig: { HeaderBehavior: 'none' },
          CookiesConfig: { CookieBehavior: 'none' },
          QueryStringsConfig: { QueryStringBehavior: 'none' },
        }),
      },
    });
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultCacheBehavior: Match.objectLike({
          Compress: true,
          ViewerProtocolPolicy: 'redirect-to-https',
          AllowedMethods: ['GET', 'HEAD'],
          CachePolicyId: { Ref: Match.stringLikeRegexp('^CachePolicy') },
          ResponseHeadersPolicyId: { Ref: Match.stringLikeRegexp('^ResponseHeaders') },
        }),
        Aliases: ['models.askcalls.com'],
      },
    });
  });

  it('serves from the CloudFront domain without a custom domain', () => {
    const plain = template(
      synth({ 'askcalls:modelsDomain': '', 'askcalls:modelsCertificateArn': '' }).models,
    );
    plain.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: Match.absent() }),
    });
  });

  it('answers CORS for GET/HEAD from any origin', () => {
    t.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        CorsConfig: Match.objectLike({
          AccessControlAllowOrigins: { Items: ['*'] },
          AccessControlAllowMethods: { Items: ['GET', 'HEAD'] },
          AccessControlAllowCredentials: false,
          OriginOverride: true,
        }),
      }),
    });
  });

  it('takes a custom domain from context', () => {
    const cert = `arn:aws:acm:us-east-1:${ACCOUNT}:certificate/abc`;
    const custom = template(
      synth({
        'askcalls:modelsDomain': 'models.askcalls.com',
        'askcalls:modelsCertificateArn': cert,
      }).models,
    );
    custom.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['models.askcalls.com'],
        ViewerCertificate: {
          AcmCertificateArn: cert,
          MinimumProtocolVersion: 'TLSv1.2_2021',
          SslSupportMethod: 'sni-only',
        },
      }),
    });
    expect(custom.findOutputs('ModelsUrl').ModelsUrl!.Value).toBe('https://models.askcalls.com');
  });
});

describe('AskCallsGithubDeploy', () => {
  let t: Template;
  beforeAll(() => {
    t = template(stacks.github);
  });

  const subjects = (...envs: string[]) =>
    envs.flatMap((e) => [
      `repo:Heknon@37449596/AskCalls@1456390963:environment:${e}`,
      `repo:Heknon@37449596/AskCalls@1456390963:environment:${e.charAt(0).toUpperCase()}${e.slice(1)}`,
    ]);

  it('defaults the OIDC subject to the repository name', () => {
    const named = synth({ 'askcalls:githubSubjectPrefix': '' });
    expect(named.config.githubSubjectPrefix).toBe('repo:Heknon/AskCalls');
  });

  const trust = (roleName: string) => {
    const roles = t.findResources('AWS::IAM::Role', { Properties: { RoleName: roleName } });
    const role = Object.values(roles)[0]!;
    return role.Properties.AssumeRolePolicyDocument.Statement as Record<string, unknown>[];
  };

  it('creates the GitHub OIDC provider, or reuses an existing one', () => {
    t.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
    const arn = `arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com`;
    const reused = template(synth({ 'askcalls:existingOidcProviderArn': arn }).github);
    reused.resourceCountIs('AWS::IAM::OIDCProvider', 0);
  });

  it("trusts only this repo's dev and production environments to deploy", () => {
    expect(trust('askcalls-github-deploy')).toEqual([
      {
        Action: 'sts:AssumeRoleWithWebIdentity',
        Effect: 'Allow',
        Principal: { Federated: { Ref: expect.stringMatching(/^GithubOidc/) } },
        Condition: {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': subjects('dev', 'production'),
          },
        },
      },
    ]);
  });

  it('trusts only the preview environment to clean up previews', () => {
    const [statement] = trust('askcalls-github-preview-cleanup');
    expect(statement!.Condition).toEqual({
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': subjects('preview'),
      },
    });
  });

  it('lets the deploy role reach only the CDK bootstrap roles and the models bucket', () => {
    const policies = t.findResources('AWS::IAM::Policy');
    const deploy = Object.values(policies).find((p) =>
      JSON.stringify(p.Properties.Roles).includes('DeployRole'),
    )!;
    const json = JSON.stringify(deploy.Properties.PolicyDocument.Statement);
    expect(json).toContain(`:role/cdk-hnb659fds-*-${ACCOUNT}-eu-central-1`);
    expect(json).toContain('arn:aws:s3:::askcalls-models/e5-pruned/*');
    expect(json).not.toContain('askcalls-prod');
    expect(json).not.toContain('askcalls-dev');
    expect(json).not.toMatch(/"Action":"(\*|s3:\*|iam:[^"]*)"/);
  });

  it('lets the cleanup role list and delete preview/ objects in the dev bucket only', () => {
    const policies = t.findResources('AWS::IAM::Policy');
    const cleanup = Object.values(policies).find((p) =>
      JSON.stringify(p.Properties.Roles).includes('PreviewCleanupRole'),
    )!;
    expect(cleanup.Properties.PolicyDocument.Statement).toEqual([
      {
        Action: 's3:ListBucket',
        Effect: 'Allow',
        Resource: 'arn:aws:s3:::askcalls-dev',
        Condition: { StringLike: { 's3:prefix': ['preview/*'] } },
      },
      {
        Action: 's3:DeleteObject',
        Effect: 'Allow',
        Resource: 'arn:aws:s3:::askcalls-dev/preview/*',
      },
    ]);
  });
});
