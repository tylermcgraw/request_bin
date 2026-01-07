import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as docdb from 'aws-cdk-lib/aws-docdb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as path from 'path';

export class RequestBinStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. VPC
    const vpc = new ec2.Vpc(this, 'RequestBinVPC', {
      maxAzs: 2,
      natGateways: 1, // Needed for Lambda to access internet (if needed) or external APIs
    });

    // 2. Security Groups
    const lambdaSG = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc,
      description: 'Security Group for Request Bin Lambdas',
      allowAllOutbound: true,
    });

    // 3. PostgreSQL (RDS)
    const postgres = new rds.DatabaseInstance(this, 'PostgresDB', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_1 }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO), // Free tier
      allocatedStorage: 20,
      databaseName: 'request_bin',
      securityGroups: [], // Will add ingress rule later
    });

    postgres.connections.allowFrom(lambdaSG, ec2.Port.tcp(5432), 'Allow connection from Lambda');

    // 4. DocumentDB (MongoDB Compatible)
    const docdbCluster = new docdb.DatabaseCluster(this, 'DocDBCluster', {
      masterUser: {
        username: 'docdbadmin',
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM), // Minimum size
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      vpc,
      instances: 1,
    });

    docdbCluster.connections.allowFrom(lambdaSG, ec2.Port.tcp(27017), 'Allow connection from Lambda');

    // 5. Backend Lambdas
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSG],
      environment: {
        PGHOST: postgres.instanceEndpoint.hostname,
        PGPORT: postgres.instanceEndpoint.port.toString(),
        PGDATABASE: 'request_bin',
        // Note: In production, use Secrets Manager. Here we unwrap for compatibility with existing code.
        PGUSER: postgres.secret?.secretValueFromJson('username').unsafeUnwrap() || '',
        PGPASSWORD: postgres.secret?.secretValueFromJson('password').unsafeUnwrap() || '',

        // Construct Mongo URI: mongodb://<user>:<password>@<endpoint>:<port>/?ssl=true&...
        MONGO_URI: `mongodb://${docdbCluster.secret?.secretValueFromJson('username').unsafeUnwrap()}:${docdbCluster.secret?.secretValueFromJson('password').unsafeUnwrap()}@${docdbCluster.clusterEndpoint.hostname}:${docdbCluster.clusterEndpoint.port}/?ssl=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`,
        MONGO_DB_NAME: 'request_bin',
      },
      bundling: {
        externalModules: ['aws-sdk', '@aws-sdk/client-apigatewaymanagementapi'], // Already available in Lambda runtime? Actually apigatewaymanagementapi might not be in v20 standard layer if very new, but usually is. Safer to include?
        // Let's bundle it to be safe, but exclude aws-sdk v2 if present.
        // Actually, Node 20 runtime has aws-sdk v3.
        // We will force local bundling to avoid Docker requirement
        forceDockerBundling: false,
      },
      timeout: cdk.Duration.seconds(10),
    };

    const httpHandler = new lambdaNode.NodejsFunction(this, 'HttpHandler', {
      entry: path.join(__dirname, '../../backend/lambda.js'),
      handler: 'handler',
      ...commonLambdaProps,
    });

    const wsHandler = new lambdaNode.NodejsFunction(this, 'WsHandler', {
      entry: path.join(__dirname, '../../backend/ws_lambda.js'),
      handler: 'handler',
      ...commonLambdaProps,
    });

    // 6. WebSocket API
    const webSocketApi = new apigwv2.WebSocketApi(this, 'RequestBinWebSocketApi', {
      connectRouteOptions: {
        integration: new apigwv2_integrations.WebSocketLambdaIntegration('ConnectIntegration', wsHandler),
      },
      disconnectRouteOptions: {
        integration: new apigwv2_integrations.WebSocketLambdaIntegration('DisconnectIntegration', wsHandler),
      },
      defaultRouteOptions: {
        integration: new apigwv2_integrations.WebSocketLambdaIntegration('DefaultIntegration', wsHandler),
      },
    });

    const webSocketStage = new apigwv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    const webSocketUrl = webSocketStage.url;

    // Grant Lambda permission to Manage Connections on WS API
    webSocketApi.grantManageConnections(wsHandler);
    webSocketApi.grantManageConnections(httpHandler); // HTTP handler sends updates too

    // Pass WS Endpoint to HTTP Handler
    httpHandler.addEnvironment('WEBSOCKET_API_ENDPOINT', webSocketUrl.replace('wss://', 'https://'));

    // 7. HTTP API
    const httpApi = new apigwv2.HttpApi(this, 'RequestBinHttpApi', {
      corsPreflight: {
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowOrigins: ['*'],
        allowHeaders: ['*'],
      },
    });

    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration: new apigwv2_integrations.HttpLambdaIntegration('HttpIntegration', httpHandler),
    });

    // 8. Frontend Hosting (S3 + CloudFront)
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(`${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
    });

    // Deploy Frontend Assets
    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: frontendBucket,
      distribution,
      distributionPaths: ['/*'], // Invalidate cache
    });

    // Outputs
    new cdk.CfnOutput(this, 'FrontendURL', { value: distribution.domainName });
    new cdk.CfnOutput(this, 'WebSocketURI', { value: webSocketUrl });
  }
}
