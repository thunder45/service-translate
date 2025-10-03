import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class EcsStreamingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC for ECS
    const vpc = new ec2.Vpc(this, 'StreamingVpc', {
      maxAzs: 2,
      natGateways: 1, // Cost optimization
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'StreamingCluster', {
      vpc,
      containerInsights: true,
    });

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'StreamingTask', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // Add permissions
    taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: ['transcribe:*', 'translate:*', 'dynamodb:*'],
      resources: ['*'],
    }));

    // Container
    taskDefinition.addContainer('StreamingContainer', {
      image: ecs.ContainerImage.fromAsset('../streaming-service'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'streaming',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        CONNECTIONS_TABLE: 'your-connections-table',
        SESSIONS_TABLE: 'your-sessions-table',
      },
      portMappings: [{ containerPort: 8080 }],
    });

    // Service (auto-scaling)
    new ecs.FargateService(this, 'StreamingService', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      minHealthyPercent: 0, // Allow stopping all tasks for cost savings
      maxHealthyPercent: 200,
    });
  }
}
