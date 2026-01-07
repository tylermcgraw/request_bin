#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RequestBinStack } from '../lib/request-bin-stack';

const app = new cdk.App();
new RequestBinStack(app, 'RequestBinStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
