import type { App } from 'aws-cdk-lib';
import { DEPLOY_ENVS, MODELS_STACK, readConfig } from './config';
import { GithubDeployStack } from './github-deploy-stack';
import { ModelsStack } from './models-stack';
import { StorageStack } from './storage-stack';

/**
 * Every stack, from cdk.json's `askcalls:*` context (docs/deployment.md):
 *
 * - AskCallsGithubDeploy  the OIDC roles GitHub Actions assumes; deployed by hand once
 * - AskCallsStorage-dev   askcalls-dev and its IAM user; deploy.yml on dev
 * - AskCallsStorage-prod  askcalls-prod and its IAM user; deploy.yml on production
 * - AskCallsModels        askcalls-models behind CloudFront; deploy.yml on production
 */
export function buildStacks(app: App) {
  const config = readConfig(app);
  const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.region };

  const github = new GithubDeployStack(app, 'AskCallsGithubDeploy', {
    env,
    subjectPrefix: config.githubSubjectPrefix,
    ...(config.existingOidcProviderArn && {
      existingOidcProviderArn: config.existingOidcProviderArn,
    }),
    devBucket: config.buckets.dev,
    modelsBucket: config.modelsBucket,
  });

  const storage = Object.fromEntries(
    DEPLOY_ENVS.map((deployEnv) => [
      deployEnv,
      new StorageStack(app, `AskCallsStorage-${deployEnv}`, {
        env,
        deployEnv,
        bucketName: config.buckets[deployEnv],
        appOrigins: config.appOrigins[deployEnv],
      }),
    ]),
  ) as Record<(typeof DEPLOY_ENVS)[number], StorageStack>;

  const models = new ModelsStack(app, MODELS_STACK, {
    env,
    bucketName: config.modelsBucket,
    ...(config.modelsDomain && {
      domainName: config.modelsDomain,
      certificateArn: config.modelsCertificateArn,
    }),
  });

  return { config, github, storage, models };
}
