import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import {
  CDK_QUALIFIER,
  DEPLOY_ENVS,
  GITHUB_ENVIRONMENT,
  MODELS_PREFIX,
  MODELS_STACK,
  PREVIEW_GITHUB_ENVIRONMENT,
  PREVIEW_PREFIX,
} from './config';

interface GithubDeployStackProps extends StackProps {
  /** owner/name */
  githubRepo: string;
  /** An account can hold one GitHub OIDC provider; pass its ARN if it already exists. */
  existingOidcProviderArn?: string;
  /** The dev bucket, which previews share under `preview/pr-<n>/`. */
  devBucket: string;
  modelsBucket: string;
}

const OIDC_HOST = 'token.actions.githubusercontent.com';

/**
 * GitHub matches environment names case-insensitively, but the token's `sub` carries the name
 * as configured and IAM compares it exactly, so both spellings are trusted.
 */
export function environmentSubjects(repo: string, environments: string[]): string[] {
  return environments.flatMap((name) => {
    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
    return [...new Set([name, capitalized])].map((s) => `repo:${repo}:environment:${s}`);
  });
}

/**
 * The roles GitHub Actions assumes through OIDC, so GitHub holds no long-lived AWS keys.
 * Deployed once by hand (docs/deployment.md); no workflow deploys it.
 *
 * - `askcalls-github-deploy`: only jobs in this repo's `dev` or `production` GitHub
 *   environment. It may hand off to the CDK bootstrap roles (which deploy the stacks), publish
 *   model builds into the models bucket, and read the models stack's outputs.
 * - `askcalls-github-preview-cleanup`: only jobs in the `preview` environment. It may list and
 *   delete `preview/` objects in the dev bucket, nothing else.
 */
export class GithubDeployStack extends Stack {
  readonly deployRole: iam.Role;
  readonly previewCleanupRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubDeployStackProps) {
    super(scope, id, props);

    // Native AWS::IAM::OIDCProvider: no custom-resource Lambda. AWS validates GitHub's
    // certificate itself, so no thumbprint is pinned.
    const provider = props.existingOidcProviderArn
      ? iam.OidcProviderNative.fromOidcProviderArn(
          this,
          'GithubOidc',
          props.existingOidcProviderArn,
        )
      : new iam.OidcProviderNative(this, 'GithubOidc', {
          url: `https://${OIDC_HOST}`,
          clientIds: ['sts.amazonaws.com'],
        });

    const trust = (environments: string[]) =>
      new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          [`${OIDC_HOST}:aud`]: 'sts.amazonaws.com',
          [`${OIDC_HOST}:sub`]: environmentSubjects(props.githubRepo, environments),
        },
      });

    this.deployRole = new iam.Role(this, 'DeployRole', {
      roleName: 'askcalls-github-deploy',
      description: 'GitHub Actions deploys (dev and production environments)',
      maxSessionDuration: Duration.hours(1),
      assumedBy: trust(DEPLOY_ENVS.map((env) => GITHUB_ENVIRONMENT[env])),
    });
    // cdk deploy: the bootstrap's deploy, file-publishing and lookup roles of this account and
    // region. They hold the actual permissions (CloudFormation passes the execution role).
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-${CDK_QUALIFIER}-*-${this.account}-${this.region}`,
        ],
      }),
    );
    // models:publish: HEAD (GetObject) and PUT build files; List so a missing key reads 404.
    const models = `arn:aws:s3:::${props.modelsBucket}`;
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [`${models}/${MODELS_PREFIX}*`],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({ actions: ['s3:ListBucket'], resources: [models] }),
    );
    // The deploy workflow reads the model URL (ModelsUrl output) to verify a publish.
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: [
          `arn:aws:cloudformation:${this.region}:${this.account}:stack/${MODELS_STACK}/*`,
        ],
      }),
    );

    this.previewCleanupRole = new iam.Role(this, 'PreviewCleanupRole', {
      roleName: 'askcalls-github-preview-cleanup',
      description: "Deletes a closed pull request's preview blobs",
      maxSessionDuration: Duration.hours(1),
      assumedBy: trust([PREVIEW_GITHUB_ENVIRONMENT]),
    });
    const dev = `arn:aws:s3:::${props.devBucket}`;
    this.previewCleanupRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [dev],
        conditions: { StringLike: { 's3:prefix': [`${PREVIEW_PREFIX}*`] } },
      }),
    );
    this.previewCleanupRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:DeleteObject'],
        resources: [`${dev}/${PREVIEW_PREFIX}*`],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', { value: this.deployRole.roleArn });
    new CfnOutput(this, 'PreviewCleanupRoleArn', { value: this.previewCleanupRole.roleArn });
  }
}
