
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface InventoryItem {
  arn: string;
  service: string;
  resourceType: string;
  resourceId: string;
  tags: Record<string, string>;
}

export interface CloudTrailEvent {
  EventId: string;
  EventName: string;
  EventTime: Date;
  Username: string;
  EventSource: string;
  Resources: any[];
  CloudTrailEvent: string; // JSON string
}

export interface BedrockRuntime {
  agentRuntimeId: string;
  agentName: string; 
  status: string;
  updatedAt: Date;
  raw: any;
}

export interface LogEvent {
  eventId: string;
  timestamp: number;
  message: string;
  ingestionTime: number;
}

export interface LogGroup {
  logGroupName: string;
  creationTime: number;
  storedBytes: number;
}

export interface TagFilter {
  key: string;
  value: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface QueryResultRow {
    [key: string]: string;
}

export interface OrgAccount {
  Id: string;
  Arn: string;
  Email: string;
  Name: string;
  Status: string;
  OU?: string;
}

export interface IamRole {
    RoleId: string;
    RoleName: string;
    Arn: string;
    CreateDate: Date;
    AssumeRolePolicyDocument?: string; 
    Description?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  service: string;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

export interface Ec2Instance {
  InstanceId: string;
  Name: string;
  State: string; // running, stopped, etc
  PrivateIpAddress: string;
  PublicIpAddress?: string;
  Platform: string;
  PingStatus: 'Online' | 'Offline' | 'Unknown'; // SSM Status
  LaunchTime: Date;
}

export interface CloudFormationStackSummary {
  StackName: string;
  StackId: string;
  StackStatus: string;
  CreationTime: Date;
  TemplateDescription?: string;
}