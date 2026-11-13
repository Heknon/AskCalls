import type { App } from 'aws-cdk-lib';

/** The hosted environments with a bucket of their own; previews share dev's (`preview/pr-<n>/`). */
export const DEPLOY_ENVS = ['dev', 'prod'] as const;
export type DeployEnv = (typeof DEPLOY_ENVS)[number];

/** GitHub environment allowed to deploy each stack (see .github/workflows/deploy.yml). */
export const GITHUB_ENVIRONMENT: Record<DeployEnv, string> = {
  dev: 'dev',
  prod: 'production',
};

/** The GitHub environment that deletes a closed pull request's blobs (preview.yml). */
export const PREVIEW_GITHUB_ENVIRONMENT = 'preview';

/** Key prefix of every preview's objects in the dev bucket (`S3_KEY_PREFIX=preview/pr-<n>/`). */
export const PREVIEW_PREFIX = 'preview/';

/** Days before a preview object expires even if the PR-close cleanup missed it. */
export const PREVIEW_EXPIRY_DAYS = 14;

/** CDK's default bootstrap qualifier: the deploy role may only assume these bootstrap roles. */
export const CDK_QUALIFIER = 'hnb659fds';

/** Model builds live under `e5-pruned/<build>/` (MODEL_BUILD_PATH in apps/web/src/client/assets.ts). */
export const MODELS_PREFIX = 'e5-pruned/';

export const MODELS_STACK = 'AskCallsModels';

export interface InfraConfig {
  region: string;
  githubRepo: string;
  buckets: Record<DeployEnv, string>;
  modelsBucket: string;
  /** Origins the browser PUTs and GETs recordings from, per environment (bucket CORS). */
  appOrigins: Record<DeployEnv, string[]>;
  /** An account holds one GitHub OIDC provider; pass its ARN if it already exists. */
  existingOidcProviderArn?: string;
  /** Custom domain for the model CDN (e.g. `models.askcalls.com`), with its us-east-1 ACM cert. */
  modelsDomain?: string;
  modelsCertificateArn?: string;
}

function required<T>(app: App, key: string): T {
  const value = app.node.tryGetContext(`askcalls:${key}`);
  if (value === undefined || value === '') throw new Error(`cdk.json: askcalls:${key} is required`);
  return value as T;
}

function optional(app: App, key: string): string | undefined {
  const value = app.node.tryGetContext(`askcalls:${key}`);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Reads `askcalls:*` context (cdk.json, or `-c askcalls:<key>=…` for the optional strings). */
export function readConfig(app: App): InfraConfig {
  const config: InfraConfig = {
    region: required(app, 'region'),
    githubRepo: required(app, 'githubRepo'),
    buckets: required(app, 'buckets'),
    modelsBucket: required(app, 'modelsBucket'),
    appOrigins: required(app, 'appOrigins'),
  };
  const oidc = optional(app, 'existingOidcProviderArn');
  if (oidc) config.existingOidcProviderArn = oidc;
  const domain = optional(app, 'modelsDomain');
  const cert = optional(app, 'modelsCertificateArn');
  if (Boolean(domain) !== Boolean(cert)) {
    throw new Error('askcalls:modelsDomain and askcalls:modelsCertificateArn go together');
  }
  if (domain && cert) {
    if (!cert.startsWith('arn:aws:acm:us-east-1:')) {
      throw new Error('askcalls:modelsCertificateArn must be in us-east-1 (CloudFront)');
    }
    config.modelsDomain = domain;
    config.modelsCertificateArn = cert;
  }
  for (const env of DEPLOY_ENVS) {
    if (!config.buckets[env]) throw new Error(`cdk.json: askcalls:buckets.${env} is required`);
    if (!config.appOrigins[env]?.length) {
      throw new Error(`cdk.json: askcalls:appOrigins.${env} needs at least one origin`);
    }
  }
  return config;
}
