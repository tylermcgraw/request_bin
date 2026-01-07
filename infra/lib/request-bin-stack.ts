import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
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
      natGateways: 0, // No NAT Gateway needed (saving ~$30/mo)
    });

    // 2. Security Groups
    const dbSG = new ec2.SecurityGroup(this, 'DBSG', {
      vpc,
      description: 'Security Group for RDS',
      allowAllOutbound: true,
    });

    // Allow public access to RDS (password protected)
    dbSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), 'Allow public access to Postgres');

    // 3. PostgreSQL (RDS)
    const postgres = new rds.DatabaseInstance(this, 'PostgresDB', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // Public Subnet
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO), // Free tier
      allocatedStorage: 20,
      databaseName: 'request_bin',
      securityGroups: [dbSG],
      publiclyAccessible: true, // Key change for Lambda outside VPC
    });

    // 4. DynamoDB (Replaces DocumentDB)
    const requestBodiesTable = new dynamodb.Table(this, 'RequestBodiesTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Free tier eligible
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test
    });

    // 5. Backend Lambdas
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      // No VPC configuration -> Lambda runs in AWS service VPC with public internet access
      environment: {
        PGHOST: postgres.instanceEndpoint.hostname,
        PGPORT: postgres.instanceEndpoint.port.toString(),
        PGDATABASE: 'request_bin',
        // Note: In production, use Secrets Manager. Here we unwrap for compatibility with existing code.
        PGUSER: postgres.secret?.secretValueFromJson('username').unsafeUnwrap() || '',
        PGPASSWORD: postgres.secret?.secretValueFromJson('password').unsafeUnwrap() || '',

        DYNAMO_TABLE_NAME: requestBodiesTable.tableName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
      bundling: {
        externalModules: ['aws-sdk', '@aws-sdk/client-apigatewaymanagementapi', '@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
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

    // Grant permissions
    requestBodiesTable.grantReadWriteData(httpHandler);
    requestBodiesTable.grantReadWriteData(wsHandler);

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
