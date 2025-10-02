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

    const terminologyTable = new dynamodb.Table(this, 'TerminologyTable', {
      partitionKey: { name: 'sourceText', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Cognito User Pool for Admin Authentication
    const userPool = new cognito.UserPool(this, 'AdminUserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('AdminClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // Lambda Functions - using pre-compiled JavaScript handlers
    const lambdaCode = lambda.Code.fromAsset('../lambdas/handlers');

    const connectHandler = new lambda.Function(this, 'ConnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'connect.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
      },
      timeout: cdk.Duration.seconds(30),
    });

    const disconnectHandler = new lambda.Function(this, 'DisconnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'disconnect.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    const startSessionHandler = new lambda.Function(this, 'StartSessionHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'startsession.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    const audioStreamHandler = new lambda.Function(this, 'AudioStreamHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'audiostream.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
        TERMINOLOGY_TABLE: terminologyTable.tableName,
        WEBSOCKET_API_ENDPOINT: '',
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
    });

    const endSessionHandler = new lambda.Function(this, 'EndSessionHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'endsession.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    const joinSessionHandler = new lambda.Function(this, 'JoinSessionHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'joinsession.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    const setLanguageHandler = new lambda.Function(this, 'SetLanguageHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'setlanguage.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
      timeout: cdk.Duration.seconds(10),
    });

    const leaveSessionHandler = new lambda.Function(this, 'LeaveSessionHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'leavesession.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
      },
      timeout: cdk.Duration.seconds(10),
    });

    const addTerminologyHandler = new lambda.Function(this, 'AddTerminologyHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'addterminology.handler',
      code: lambdaCode,
      environment: {
        TERMINOLOGY_TABLE: terminologyTable.tableName,
        WEBSOCKET_API_ENDPOINT: '',
      },
      timeout: cdk.Duration.seconds(30),
    });

    const listSessionsHandler = new lambda.Function(this, 'ListSessionsHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'listsessions.handler',
      code: lambdaCode,
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
        WEBSOCKET_API_ENDPOINT: '',
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Grant permissions
    connectionsTable.grantReadWriteData(connectHandler);
    connectionsTable.grantReadWriteData(disconnectHandler);
    connectionsTable.grantReadWriteData(startSessionHandler);
    connectionsTable.grantReadWriteData(audioStreamHandler);
    connectionsTable.grantReadWriteData(endSessionHandler);
    connectionsTable.grantReadWriteData(joinSessionHandler);
    connectionsTable.grantReadWriteData(setLanguageHandler);
    connectionsTable.grantReadWriteData(leaveSessionHandler);
    connectionsTable.grantReadWriteData(listSessionsHandler);

    sessionsTable.grantReadWriteData(disconnectHandler);
    sessionsTable.grantReadWriteData(startSessionHandler);
    sessionsTable.grantReadWriteData(audioStreamHandler);
    sessionsTable.grantReadWriteData(endSessionHandler);
    sessionsTable.grantReadWriteData(joinSessionHandler);
    sessionsTable.grantReadWriteData(setLanguageHandler);
    sessionsTable.grantReadWriteData(leaveSessionHandler);
    sessionsTable.grantReadWriteData(listSessionsHandler);

    terminologyTable.grantReadWriteData(addTerminologyHandler);
    terminologyTable.grantReadData(audioStreamHandler);

    // Grant Transcribe and Translate permissions
    audioStreamHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['transcribe:*', 'translate:*'],
      resources: ['*'],
    }));

    // WebSocket API
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'ServiceTranslateAPI', {
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', connectHandler),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', disconnectHandler),
      },
    });

    // Add routes
    webSocketApi.addRoute('startsession', {
      integration: new WebSocketLambdaIntegration('StartSessionIntegration', startSessionHandler),
    });

    webSocketApi.addRoute('audiostream', {
      integration: new WebSocketLambdaIntegration('AudioStreamIntegration', audioStreamHandler),
    });

    webSocketApi.addRoute('endsession', {
      integration: new WebSocketLambdaIntegration('EndSessionIntegration', endSessionHandler),
    });

    webSocketApi.addRoute('joinsession', {
      integration: new WebSocketLambdaIntegration('JoinSessionIntegration', joinSessionHandler),
    });

    webSocketApi.addRoute('setlanguage', {
      integration: new WebSocketLambdaIntegration('SetLanguageIntegration', setLanguageHandler),
    });

    webSocketApi.addRoute('leavesession', {
      integration: new WebSocketLambdaIntegration('LeaveSessionIntegration', leaveSessionHandler),
    });

    webSocketApi.addRoute('addterminology', {
      integration: new WebSocketLambdaIntegration('AddTerminologyIntegration', addTerminologyHandler),
    });

    webSocketApi.addRoute('listsessions', {
      integration: new WebSocketLambdaIntegration('ListSessionsIntegration', listSessionsHandler),
    });

    const stage = new apigatewayv2.WebSocketStage(this, 'ProdStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Grant API Gateway management permissions to all handlers
    const apiManagementPolicy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`],
    });

    [startSessionHandler, audioStreamHandler, endSessionHandler, 
     joinSessionHandler, setLanguageHandler, leaveSessionHandler, listSessionsHandler, addTerminologyHandler].forEach(fn => {
      fn.addToRolePolicy(apiManagementPolicy);
      fn.addEnvironment('WEBSOCKET_API_ENDPOINT', stage.url);
    });

    // Outputs
    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: stage.url,
      description: 'WebSocket API URL (use https:// in env vars, convert to wss:// in clients)',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
  }
}
