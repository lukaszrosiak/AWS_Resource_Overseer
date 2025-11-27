
import { InventoryItem, CloudTrailEvent, BedrockRuntime, LogGroup, LogEvent, IamRole } from './types';

export const generateMockInventory = (): InventoryItem[] => {
  const services = ['ec2', 's3', 'rds', 'lambda', 'dynamodb', 'vpc', 'elasticloadbalancing'];
  const items: InventoryItem[] = [];
  const mockTags = [
    { Environment: 'Production', CostCenter: '1024', Project: 'Alpha' },
    { Environment: 'Staging', Owner: 'Mike' },
    { Application: 'DataPipeline', Tier: 'Backend' },
    { Name: 'BastionHost', ManagedBy: 'Terraform' },
  ];

  for (let i = 0; i < 150; i++) {
    const service = services[Math.floor(Math.random() * services.length)];
    const randomId = Math.random().toString(36).substr(2, 8);
    let resourceType = 'generic';
    
    if (service === 'ec2') {
        const ec2Types = ['instance', 'volume', 'security-group', 'snapshot', 'network-interface'];
        resourceType = ec2Types[Math.floor(Math.random() * ec2Types.length)];
    } else if (service === 's3') resourceType = 'bucket';
    else if (service === 'lambda') resourceType = 'function';
    
    items.push({
      arn: `arn:aws:${service}:eu-west-1:123456789012:${resourceType}/${service}-res-${randomId}`,
      service: service,
      resourceType: resourceType,
      resourceId: `${service}-res-${randomId}`,
      tags: mockTags[Math.floor(Math.random() * mockTags.length)]
    });
  }
  return items;
};

export const generateMockEvents = (resourceId: string): CloudTrailEvent[] => {
  const events: CloudTrailEvent[] = [];
  const actions = ['RunInstances', 'StopInstances', 'CreateTags', 'DeleteTags', 'AttachVolume'];
  const users = ['admin', 'terraform-user', 'system-autoscaling', 'developer-1'];
  
  for(let i=0; i < 8; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    events.push({
      EventId: Math.random().toString(36),
      EventName: actions[Math.floor(Math.random() * actions.length)],
      EventTime: date,
      Username: users[Math.floor(Math.random() * users.length)],
      EventSource: 'ec2.amazonaws.com',
      Resources: [],
      CloudTrailEvent: JSON.stringify({ 
        requestParameters: { instanceId: resourceId, dryRun: false },
        responseElements: { requestId: Math.random().toString(36) }
      })
    });
  }
  return events;
};

export const generateMockBedrockRuntimes = (): BedrockRuntime[] => {
  const runtimes: BedrockRuntime[] = [];
  const statuses = ['AVAILABLE', 'CREATING', 'FAILED', 'DELETING'];
  
  for(let i=0; i < 5; i++) {
     runtimes.push({
         agentRuntimeId: `AGE-${Math.random().toString(36).substr(2,8).toUpperCase()}`,
         agentName: `agent-core-${i + 1}`,
         status: statuses[Math.floor(Math.random() * statuses.length)],
         updatedAt: new Date(Date.now() - Math.floor(Math.random() * 1000000000)),
         raw: { someSummaryData: 'xyz', instruction: 'This is a mock instruction for the agent.' }
     })
  }
  return runtimes;
};

export const generateMockLogGroups = (): LogGroup[] => {
    return [
        '/aws/lambda/my-function-prod',
        '/aws/lambda/my-function-staging',
        '/aws/rds/cluster/db-cluster-1/postgresql',
        '/aws/bedrock/agent/AGE-X82JS92',
        '/aws/eks/main-cluster/cluster',
        '/aws/containerinsights/main-cluster/application',
        '/aws/vpc/flow-logs',
        'API-Gateway-Execution-Logs_demo/prod',
        '/aws/codebuild/project-build'
    ].map(name => ({ logGroupName: name, creationTime: Date.now(), storedBytes: 1024 }));
};

export const generateMockLogs = (count = 20): LogEvent[] => {
    const logs: LogEvent[] = [];
    const messages = [
        '[INFO] Request received for handler',
        '[WARN] Deprecated API usage detected',
        JSON.stringify({ level: 'info', service: 'payment', msg: 'Transaction completed', amount: 45.00, currency: 'USD' }),
        '[ERROR] Connection timeout waiting for DB',
        'START RequestId: 890-123 Version: $LATEST',
        'END RequestId: 890-123',
        'REPORT RequestId: 890-123 Duration: 100ms Billed Duration: 100ms Memory Size: 128MB Max Memory Used: 68MB',
    ];
    
    for(let i=0; i < count; i++) {
        logs.push({
            eventId: Math.random().toString(36),
            timestamp: Date.now() - (i * 60000),
            ingestionTime: Date.now(),
            message: messages[Math.floor(Math.random() * messages.length)]
        });
    }
    return logs;
}

export const generateMockIamRoles = (): IamRole[] => {
    return [
        {
            RoleId: 'AROA1234567890EXAMPLE',
            RoleName: 'OrganizationAccountAccessRole',
            Arn: 'arn:aws:iam::234567890123:role/OrganizationAccountAccessRole',
            CreateDate: new Date('2023-01-15'),
            Description: 'Default role for Org Access',
            AssumeRolePolicyDocument: encodeURIComponent(JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { "AWS": "arn:aws:iam::123456789012:root" },
                    Action: "sts:AssumeRole"
                }]
            }))
        },
        {
            RoleId: 'AROA9876543210EXAMPLE',
            RoleName: 'EC2InstanceProfileRole',
            Arn: 'arn:aws:iam::234567890123:role/EC2InstanceProfileRole',
            CreateDate: new Date('2023-03-10'),
            Description: 'Allows EC2 instances to call AWS services',
            AssumeRolePolicyDocument: encodeURIComponent(JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { "Service": "ec2.amazonaws.com" },
                    Action: "sts:AssumeRole"
                }]
            }))
        },
        {
            RoleId: 'AROA4561237890EXAMPLE',
            RoleName: 'CrossAccountDeveloperRole',
            Arn: 'arn:aws:iam::234567890123:role/CrossAccountDeveloperRole',
            CreateDate: new Date('2023-06-20'),
            Description: 'Allows dev account to assume',
            AssumeRolePolicyDocument: encodeURIComponent(JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { "AWS": "arn:aws:iam::999999999999:root" },
                    Action: "sts:AssumeRole"
                }]
            }))
        },
        {
             RoleId: 'AROA7778889990EXAMPLE',
             RoleName: 'LambdaExecutionRole',
             Arn: 'arn:aws:iam::234567890123:role/LambdaExecutionRole',
             CreateDate: new Date('2023-08-05'),
             AssumeRolePolicyDocument: encodeURIComponent(JSON.stringify({
                 Version: "2012-10-17",
                 Statement: [{
                     Effect: "Allow",
                     Principal: { "Service": "lambda.amazonaws.com" },
                     Action: "sts:AssumeRole"
                 }]
             }))
        }
    ];
};
