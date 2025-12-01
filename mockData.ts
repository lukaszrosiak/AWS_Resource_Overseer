
import { InventoryItem, CloudTrailEvent, BedrockRuntime, LogGroup, LogEvent, IamRole, GraphNode, GraphLink, Ec2Instance, CloudFormationStackSummary } from './types';

export const generateMockInventory = (): InventoryItem[] => {
  const services = ['ec2', 's3', 'rds', 'lambda', 'dynamodb', 'vpc', 'elasticloadbalancing', 'kms'];
  const items: InventoryItem[] = [];
  const mockTags = [
    { Environment: 'Production', CostCenter: '1024', Project: 'Alpha' },
    { Environment: 'Staging', Owner: 'Mike' },
    { Application: 'DataPipeline', Tier: 'Backend' },
    { Name: 'BastionHost', ManagedBy: 'Terraform' },
  ];

  const kmsAliases = ['alias/production-db', 'alias/logs-encryption', 'alias/lambda-env', 'alias/backup-key', 'alias/s3-secure'];
  const kmsStatuses = ['Enabled', 'Disabled', 'PendingDeletion', 'PendingImport'];

  for (let i = 0; i < 150; i++) {
    const service = services[Math.floor(Math.random() * services.length)];
    const randomId = Math.random().toString(36).substr(2, 8);
    let resourceType = 'generic';
    let specificTags = {};
    
    if (service === 'ec2') {
        const ec2Types = ['instance', 'volume', 'security-group', 'snapshot', 'network-interface'];
        resourceType = ec2Types[Math.floor(Math.random() * ec2Types.length)];
    } else if (service === 's3') resourceType = 'bucket';
    else if (service === 'lambda') resourceType = 'function';
    else if (service === 'kms') {
        resourceType = 'key';
        specificTags = {
            'Alias': Math.random() > 0.3 ? kmsAliases[Math.floor(Math.random() * kmsAliases.length)] : undefined,
            'Status': kmsStatuses[Math.floor(Math.random() * kmsStatuses.length)]
        };
    }
    
    // Filter undefined tags
    const mergedTags = { ...mockTags[Math.floor(Math.random() * mockTags.length)], ...specificTags };
    Object.keys(mergedTags).forEach(key => (mergedTags as any)[key] === undefined && delete (mergedTags as any)[key]);

    items.push({
      arn: `arn:aws:${service}:eu-west-1:123456789012:${resourceType}/${service}-res-${randomId}`,
      service: service,
      resourceType: resourceType,
      resourceId: service === 'kms' ? randomId : `${service}-res-${randomId}`,
      tags: mergedTags
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

export const generateMockInstances = (): Ec2Instance[] => {
    return [
        {
            InstanceId: 'i-0a1b2c3d4e5f6g7h8',
            Name: 'bastion-prod',
            State: 'running',
            PrivateIpAddress: '10.0.1.15',
            PublicIpAddress: '54.21.12.45',
            Platform: 'Amazon Linux 2023',
            PingStatus: 'Online',
            LaunchTime: new Date(Date.now() - 86400000 * 2)
        },
        {
            InstanceId: 'i-0987654321abcdef0',
            Name: 'web-server-01',
            State: 'running',
            PrivateIpAddress: '10.0.2.100',
            Platform: 'Ubuntu 22.04',
            PingStatus: 'Online',
            LaunchTime: new Date(Date.now() - 3600000 * 4)
        },
        {
            InstanceId: 'i-11223344556677889',
            Name: 'legacy-app-server',
            State: 'stopped',
            PrivateIpAddress: '10.0.1.50',
            Platform: 'Windows Server 2019',
            PingStatus: 'Offline',
            LaunchTime: new Date(Date.now() - 86400000 * 30)
        },
        {
            InstanceId: 'i-aabbccddeeff00112',
            Name: 'worker-node-alpha',
            State: 'running',
            PrivateIpAddress: '10.0.3.12',
            Platform: 'Amazon Linux 2',
            PingStatus: 'Online',
            LaunchTime: new Date(Date.now() - 7200000)
        },
        {
            InstanceId: 'i-554433221100ffee',
            Name: 'database-standby',
            State: 'running',
            PrivateIpAddress: '10.0.4.5',
            Platform: 'Red Hat Enterprise Linux',
            PingStatus: 'Unknown', // No SSM agent
            LaunchTime: new Date(Date.now() - 86400000 * 10)
        }
    ];
};

export const generateMockStacks = (): CloudFormationStackSummary[] => {
  const statuses = ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'ROLLBACK_COMPLETE', 'CREATE_IN_PROGRESS', 'DELETE_FAILED'];
  const stacks: CloudFormationStackSummary[] = [];
  
  for(let i=0; i < 15; i++) {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 30));
    const name = `stack-env-${i}-${Math.random().toString(36).substring(7)}`;
    stacks.push({
      StackName: name,
      // Ensure StackId contains the StackName for robust matching in mock tests
      StackId: `arn:aws:cloudformation:us-east-1:123456789012:stack/${name}/${Math.random().toString(36).substring(7)}`,
      StackStatus: statuses[Math.floor(Math.random() * statuses.length)],
      CreationTime: date,
      TemplateDescription: i % 2 === 0 ? 'Managed by CDK/Terraform' : 'Manual deployment for testing',
      EnableTerminationProtection: Math.random() > 0.7 // 30% chance of being protected
    });
  }
  return stacks;
};

// --- Graph Generation Logic ---

const getMockNeighbors = (sourceId: string, type: string, service: string): { nodes: GraphNode[], links: GraphLink[] } => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    
    // Helper to add a connection
    const add = (name: string, targetType: string, targetService: string, rel: string) => {
        // Create a semi-unique ID based on name to allow re-linking if same name used, but random enough for mocks
        const id = `${targetService}-${name}-${Math.random().toString(36).substr(2, 4)}`;
        nodes.push({ id, name, type: targetType, service: targetService });
        links.push({ source: sourceId, target: id, relationship: rel });
    };

    // Define rules based on the source type
    if (type === 'instance' || (service === 'ec2' && type === 'instance')) {
        add('vpc-prod-main', 'vpc', 'vpc', 'contained_in');
        add('subnet-private-1a', 'subnet', 'vpc', 'contained_in');
        add('sg-web-access', 'security-group', 'ec2', 'attached_to');
        add('vol-system-root', 'volume', 'ec2', 'attached_to');
        add('ec2-role', 'role', 'iam', 'assumes');
    } else if (type === 'vpc') {
        add('subnet-public-1', 'subnet', 'vpc', 'contains');
        add('subnet-private-1', 'subnet', 'vpc', 'contains');
        add('igw-main', 'internet-gateway', 'vpc', 'attached_to');
        add('rtb-main', 'route-table', 'vpc', 'associated_with');
    } else if (type === 'subnet') {
        add('nacl-main', 'nacl', 'vpc', 'associated_with');
        add('nat-gateway-1', 'nat-gateway', 'vpc', 'routes_to');
    } else if (type === 'security-group') {
        add('ingress-rule-80', 'rule', 'ec2', 'permits');
        add('egress-rule-all', 'rule', 'ec2', 'permits');
    } else if (type === 'lambda' || type === 'function') {
        add('lambda-exec-role', 'role', 'iam', 'assumes');
        add('log-group-prod', 'log-group', 'cloudwatch', 'logs_to');
        add('vpc-prod-main', 'vpc', 'vpc', 'connected_to');
        add('trigger-s3', 'bucket', 's3', 'triggered_by');
    } else if (type === 'bucket') {
        add('bucket-policy', 'policy', 'iam', 'controlled_by');
        add('kms-key-s3', 'key', 'kms', 'encrypted_by');
        add('replication-rule', 'rule', 's3', 'configured_by');
    } else if (type === 'rds' || type === 'cluster') {
        add('vpc-prod-main', 'vpc', 'vpc', 'contained_in');
        add('subnet-db-group', 'subnet-group', 'rds', 'in_group');
        add('sg-db-access', 'security-group', 'ec2', 'protected_by');
        add('kms-key-db', 'key', 'kms', 'encrypted_by');
    } else if (type === 'role') {
        add('policy-access', 'policy', 'iam', 'attached_to');
        add('instance-profile', 'instance-profile', 'iam', 'associated_with');
    } else if (type === 'key') {
        add('bucket-logs', 'bucket', 's3', 'encrypts');
        add('rds-db-primary', 'cluster', 'rds', 'encrypts');
        add('ebs-vol-1', 'volume', 'ec2', 'encrypts');
    } else {
        // Fallback generic neighbors
        add('vpc-default', 'vpc', 'vpc', 'in_network');
        add('default-sg', 'security-group', 'ec2', 'firewalled_by');
    }

    return { nodes, links };
}

export const generateMockDependencies = (rootItem: InventoryItem, depth: number = 1): { nodes: GraphNode[], links: GraphLink[] } => {
    let allNodes: GraphNode[] = [];
    let allLinks: GraphLink[] = [];
    const visitedIds = new Set<string>();

    // 1. Add Root
    const rootNode: GraphNode = {
        id: rootItem.resourceId,
        name: rootItem.resourceId,
        type: rootItem.resourceType,
        service: rootItem.service
    };
    allNodes.push(rootNode);
    visitedIds.add(rootNode.id);

    // 2. Traversal
    // Current frontier of nodes to expand
    let currentLevelNodes = [rootNode];

    for (let d = 0; d < depth; d++) {
        const nextLevelNodes: GraphNode[] = [];

        for (const node of currentLevelNodes) {
            // Get mock neighbors for this node
            const { nodes: neighbors, links: newLinks } = getMockNeighbors(node.id, node.type, node.service);
            
            for (const neighbor of neighbors) {
                // Since this is mock data with random IDs, collisions are rare but logic should handle them
                // We typically just add them as new nodes for visualization
                if (!visitedIds.has(neighbor.id)) {
                    visitedIds.add(neighbor.id);
                    allNodes.push(neighbor);
                    nextLevelNodes.push(neighbor);
                }
            }
            allLinks = [...allLinks, ...newLinks];
        }
        
        // Move to next level
        currentLevelNodes = nextLevelNodes;
    }

    return { nodes: allNodes, links: allLinks };
};
