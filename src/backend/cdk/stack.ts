import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class ServiceTranslateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    const sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });
    sessionsTable.addGlobalSecondaryIndex({
      indexName: 'sessionName-index',
      partitionKey: { name: 'sessionName', type: dynamodb.AttributeType.STRING },
    });

    // Cognito User Pool for admin authentication
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
        adminUserPassword: true, // Enable ADMIN_NO_SRP_AUTH
      },
    });

    // Cognito Identity Pool for direct AWS service access
    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{
        clientId: userPoolClient.userPoolClientId,
        providerName: userPool.userPoolProviderName,
      }],
    });

    // IAM role for authenticated users (direct AWS access)
    const authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
        StringEquals: {
          'cognito-identity.amazonaws.com:aud': identityPool.ref,
        },
        'ForAnyValue:StringLike': {
          'cognito-identity.amazonaws.com:amr': 'authenticated',
        },
      }),
    });

    // Grant direct access to Transcribe and Translate
    authenticatedRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'transcribe:StartStreamTranscription',
        'translate:TranslateText',
      ],
      resources: ['*'],
    }));

    // Attach role to identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // Lambda code bundle (without Docker bundling)
    const lambdaCode = lambda.Code.fromAsset('lambdas');

    // Minimal Lambda functions (only for session management and broadcasting)
    const connectHandler = new lambda.Function(this, 'ConnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handlers/connect.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    const disconnectHandler = new lambda.Function(this, 'DisconnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handlers/disconnect.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
    });

    const startSessionHandler = new lambda.Function(this, 'StartSessionHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handlers/startsession.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
    });

    const endSessionHandler = new lambda.Function(this, 'EndSessionHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handlers/endsession.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
    });

    const joinSessionHandler = new lambda.Function(this, 'JoinSessionHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handlers/joinsession.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
    });

    const broadcastTranslationHandler = new lambda.Function(this, 'BroadcastTranslationHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handlers/broadcast-translation.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
        WEBSOCKET_API_ENDPOINT: '',
      },
    });

    // WebSocket API
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', connectHandler),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', disconnectHandler),
      },
    });

    const stage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Update WebSocket endpoint in Lambda environment
    broadcastTranslationHandler.addEnvironment('WEBSOCKET_API_ENDPOINT', stage.url);

    // Add routes
    webSocketApi.addRoute('startsession', {
      integration: new WebSocketLambdaIntegration('StartSessionIntegration', startSessionHandler),
    });

    webSocketApi.addRoute('endsession', {
      integration: new WebSocketLambdaIntegration('EndSessionIntegration', endSessionHandler),
    });

    webSocketApi.addRoute('joinsession', {
      integration: new WebSocketLambdaIntegration('JoinSessionIntegration', joinSessionHandler),
    });

    webSocketApi.addRoute('broadcast_translation', {
      integration: new WebSocketLambdaIntegration('BroadcastTranslationIntegration', broadcastTranslationHandler),
    });

    // Grant DynamoDB permissions
    connectionsTable.grantReadWriteData(connectHandler);
    connectionsTable.grantReadWriteData(disconnectHandler);
    connectionsTable.grantReadWriteData(startSessionHandler);
    connectionsTable.grantReadWriteData(endSessionHandler);
    connectionsTable.grantReadWriteData(joinSessionHandler);
    connectionsTable.grantReadWriteData(broadcastTranslationHandler);

    sessionsTable.grantReadWriteData(disconnectHandler);
    sessionsTable.grantReadWriteData(startSessionHandler);
    sessionsTable.grantReadWriteData(endSessionHandler);
    sessionsTable.grantReadWriteData(joinSessionHandler);
    sessionsTable.grantReadWriteData(broadcastTranslationHandler);

    // Grant API Gateway management permissions
    const apiManagementPolicy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*/*`],
    });

    [broadcastTranslationHandler].forEach(fn => {
      fn.addToRolePolicy(apiManagementPolicy);
    });

    // Outputs
    new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
      value: stage.url,
      description: 'WebSocket API endpoint',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: identityPool.ref,
      description: 'Cognito Identity Pool ID for direct AWS access',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
    });
  }
}
