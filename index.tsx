import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';
import { 
  Shield, Users, Search, Key, LogOut, 
  AlertTriangle, BrainCircuit, Server, ChevronDown, ChevronRight, Tag, Box, Layers, Hash, Moon, Sun, X, Globe,
  Activity, Calendar, User, FileJson, ArrowLeft, CheckCircle, XCircle, Trash2, Edit3, PlusCircle, Filter, Plus,
  Cpu, Terminal, RefreshCw, Clock, List, FileText, Sparkles, Send, MessageSquare, Bot, Database, Play, Eye,
  PieChart as PieIcon, BarChart2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { ResourceGroupsTaggingAPIClient, GetResourcesCommand } from "https://esm.sh/@aws-sdk/client-resource-groups-tagging-api?bundle";
import { CloudTrailClient, LookupEventsCommand } from "https://esm.sh/@aws-sdk/client-cloudtrail?bundle";
import { CloudWatchLogsClient, FilterLogEventsCommand, DescribeLogGroupsCommand, StartQueryCommand, GetQueryResultsCommand } from "https://esm.sh/@aws-sdk/client-cloudwatch-logs?bundle";
import { BedrockAgentClient, ListAgentsCommand, GetAgentCommand } from "https://esm.sh/@aws-sdk/client-bedrock-agent?bundle";

// --- Types ---

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

interface InventoryItem {
  arn: string;
  service: string;
  resourceType: string;
  resourceId: string;
  tags: Record<string, string>;
}

interface CloudTrailEvent {
  EventId: string;
  EventName: string;
  EventTime: Date;
  Username: string;
  EventSource: string;
  Resources: any[];
  CloudTrailEvent: string; // JSON string
}

interface BedrockRuntime {
  agentRuntimeId: string;
  agentName: string; // Mapped from agentName for display
  status: string;
  updatedAt: Date;
  raw: any;
}

interface LogEvent {
  eventId: string;
  timestamp: number;
  message: string;
  ingestionTime: number;
}

interface LogGroup {
  logGroupName: string;
  creationTime: number;
  storedBytes: number;
}

interface TagFilter {
  key: string;
  value: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface QueryResultRow {
    [key: string]: string;
}

// --- Constants ---

const AWS_REGIONS = [
  { code: 'eu-west-1', name: 'Europe (Ireland)' },
  { code: 'us-east-1', name: 'US East (N. Virginia)' },
  { code: 'us-east-2', name: 'US East (Ohio)' },
  { code: 'us-west-1', name: 'US West (N. California)' },
  { code: 'us-west-2', name: 'US West (Oregon)' },
  { code: 'af-south-1', name: 'Africa (Cape Town)' },
  { code: 'ap-east-1', name: 'Asia Pacific (Hong Kong)' },
  { code: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
  { code: 'ap-northeast-3', name: 'Asia Pacific (Osaka)' },
  { code: 'ap-northeast-2', name: 'Asia Pacific (Seoul)' },
  { code: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
  { code: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
  { code: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
  { code: 'ca-central-1', name: 'Canada (Central)' },
  { code: 'eu-central-1', name: 'Europe (Frankfurt)' },
  { code: 'eu-west-2', name: 'Europe (London)' },
  { code: 'eu-south-1', name: 'Europe (Milan)' },
  { code: 'eu-west-3', name: 'Europe (Paris)' },
  { code: 'eu-north-1', name: 'Europe (Stockholm)' },
  { code: 'me-south-1', name: 'Middle East (Bahrain)' },
  { code: 'sa-east-1', name: 'South America (São Paulo)' },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// --- Helper Functions ---

const parseArn = (arn: string) => {
  const parts = arn.split(':');
  const service = parts[2] || 'unknown';
  const resourcePart = parts.slice(5).join(':');
  
  let resourceType = 'resource';
  let resourceId = resourcePart;

  if (resourcePart.includes('/')) {
    const splitRes = resourcePart.split('/');
    resourceType = splitRes[0];
    resourceId = splitRes.slice(1).join('/');
  }

  return { service, resourceType, resourceId };
};

const mapTags = (tagList: any[]): Record<string, string> => {
    const tags: Record<string, string> = {};
    if (Array.isArray(tagList)) {
        tagList.forEach(t => {
            tags[t.Key] = t.Value;
        });
    }
    return tags;
};

// Simple SQL to Insights Pipe Transpiler
const transpileSqlToInsights = (sql: string): string => {
    let query = sql.trim();
    
    // Remove FROM clause as it is handled by the API parameter
    query = query.replace(/FROM\s+['"`]?[^'"`\s]+['"`]?\s*/i, '');

    // Map SELECT -> fields
    if (query.toUpperCase().startsWith('SELECT')) {
        query = query.replace(/^SELECT\s+/i, 'fields ');
    }

    // Map WHERE -> filter
    query = query.replace(/\s+WHERE\s+/i, ' | filter ');
    
    // Map LIKE with % wildcard
    query = query.replace(/LIKE\s+'%([^%]+)%'/gi, 'like /$1/');
    query = query.replace(/LIKE\s+'([^']+)'/gi, 'like /$1/');

    // Map ORDER BY -> sort
    query = query.replace(/\s+ORDER BY\s+/i, ' | sort ');
    
    // Map LIMIT -> limit
    query = query.replace(/\s+LIMIT\s+/i, ' | limit ');

    return query;
};

// --- Hooks ---

const useClickOutside = (ref: React.RefObject<HTMLElement | null>, handler: () => void) => {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
};

// --- Mock Data Generator ---

const generateMockInventory = (): InventoryItem[] => {
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
    if (service === 'ec2') resourceType = 'instance';
    if (service === 's3') resourceType = 'bucket';
    if (service === 'lambda') resourceType = 'function';
    
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

const generateMockEvents = (resourceId: string): CloudTrailEvent[] => {
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

const generateMockBedrockRuntimes = (): BedrockRuntime[] => {
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

const generateMockLogGroups = (): LogGroup[] => {
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

const generateMockLogs = (count = 20): LogEvent[] => {
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

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon, size = 'md' }: any) => {
  const baseStyle = "flex items-center justify-center rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--bg-main)]";
  
  const sizeStyles = {
    sm: "px-2 py-1 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  const variants = {
    primary: "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white focus:ring-[var(--accent)]",
    secondary: "bg-[var(--bg-hover)] hover:bg-[var(--border)] text-[var(--text-main)] focus:ring-[var(--text-muted)]",
    danger: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500",
    ghost: "bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyle} ${sizeStyles[size as keyof typeof sizeStyles]} ${variants[variant as keyof typeof variants]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {Icon && <Icon className={`${size === 'sm' ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />}
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }: any) => (
  <div className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 theme-transition ${className}`}>
    {children}
  </div>
);

// Individual Row Component to handle click-outside logic for tags
const ResourceRow = ({ item, onInvestigate }: { item: InventoryItem, onInvestigate: (item: InventoryItem) => void }) => {
  const [showTags, setShowTags] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const hasTags = Object.keys(item.tags).length > 0;

  useClickOutside(popupRef, () => setShowTags(false));

  return (
    <div className="p-4 hover:bg-[var(--bg-hover)]/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)]/50 last:border-0 theme-transition group">
      <div className="flex-1 min-w-0 relative">
        <div className="flex items-center space-x-2">
            <div className="relative" ref={popupRef}>
              <button 
                onClick={() => setShowTags(!showTags)}
                className={`font-mono font-medium truncate text-sm transition-colors border-b border-dashed inline-block pb-0.5 outline-none
                  ${showTags ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-main)] border-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]'}
                `}
              >
                {item.resourceId}
              </button>

              {/* Tag Popover (Click based) */}
              {showTags && (
                <div className="absolute left-0 top-full mt-2 z-[100] w-96 max-w-[85vw] animate-in fade-in slide-in-from-top-2">
                  <div className="bg-[var(--popup-bg)] border border-[var(--border)] rounded-lg shadow-2xl p-4 text-xs">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
                      <div className="font-semibold text-[var(--text-main)] flex items-center">
                        <Tag className="w-3.5 h-3.5 mr-2 text-[var(--accent)]" /> 
                        Resource Tags
                      </div>
                      <button onClick={() => setShowTags(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    {hasTags ? (
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                        {Object.entries(item.tags).map(([k, v]) => (
                          <div key={k} className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1">{k}</span>
                            <span className="text-[var(--text-main)] bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1.5 font-mono break-all leading-tight">
                              {v}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)] italic">No tags found for this resource.</span>
                    )}
                    <div className="absolute left-4 -top-1.5 w-3 h-3 bg-[var(--popup-bg)] border-t border-l border-[var(--border)] transform rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
            {hasTags && (
              <span className="bg-[var(--bg-hover)] text-[var(--text-muted)] text-[10px] px-1.5 py-0.5 rounded flex items-center">
                <Tag className="w-3 h-3 mr-1" /> {Object.keys(item.tags).length}
              </span>
            )}
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center space-x-3">
            <span className="bg-[var(--bg-card)] px-2 py-0.5 rounded border border-[var(--border)]">
                Type: {item.resourceType}
            </span>
            <span className="hidden md:inline text-[10px] truncate max-w-[200px] opacity-70">{item.arn}</span>
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
         <Button 
            variant="secondary" 
            size="sm" 
            icon={Search} 
            onClick={() => onInvestigate(item)}
            className="shadow-sm border border-[var(--border)]"
         >
           CloudTrail Logs
         </Button>
      </div>
    </div>
  );
};

const ServiceGroup = ({ service, items, onInvestigate }: { service: string, items: InventoryItem[], onInvestigate: (item: InventoryItem) => void }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="p-0 border-t-4 border-t-[var(--accent)] mb-4 transition-all duration-200">
      <div 
        className="bg-[var(--bg-card)]/80 p-4 border-b border-[var(--border)] flex justify-between items-center cursor-pointer hover:bg-[var(--bg-hover)]/50 transition-colors select-none rounded-t-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-3">
            <button className="text-[var(--text-muted)] p-1 hover:text-[var(--text-main)] transition-colors">
              {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>
            <div className="bg-[var(--bg-hover)] p-2 rounded text-[var(--text-muted)] uppercase font-bold text-xs tracking-wider">
              {service}
            </div>
            <span className="text-[var(--text-muted)] text-sm">
                <span className="text-[var(--text-main)] font-bold mr-1">{items.length}</span> 
                resources
            </span>
        </div>
      </div>
      {isOpen && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          {items.map((item, idx) => (
             <ResourceRow key={idx} item={item} onInvestigate={onInvestigate} />
          ))}
        </div>
      )}
    </Card>
  );
};

// Generic Log Explorer Component
const LogExplorer = ({ credentials, isMock }: { credentials: AwsCredentials, isMock: boolean }) => {
    const [groups, setGroups] = useState<string[]>([]);
    const [filteredGroups, setFilteredGroups] = useState<string[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEvent[]>([]);
    const [queryResults, setQueryResults] = useState<QueryResultRow[]>([]);
    
    // UI State
    const [mode, setMode] = useState<'stream' | 'query'>('stream');
    const [searchGroupTerm, setSearchGroupTerm] = useState('');
    const [filterPattern, setFilterPattern] = useState('');
    const [sqlQuery, setSqlQuery] = useState('');
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [logLimit, setLogLimit] = useState<number>(100);
    
    // Time Filtering
    const [timeMode, setTimeMode] = useState<string>('1h');
    const [customStart, setCustomStart] = useState<string>('');
    const [customEnd, setCustomEnd] = useState<string>('');

    // AI Chat State
    const [showAiPanel, setShowAiPanel] = useState(false);
    const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
    const [aiInput, setAiInput] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Initialize custom date defaults
    useEffect(() => {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        // Format for datetime-local: YYYY-MM-DDThh:mm
        const fmt = (d: Date) => d.toISOString().slice(0, 16);
        setCustomStart(fmt(oneHourAgo));
        setCustomEnd(fmt(now));
    }, []);

    // Set Default SQL Query when group changes
    useEffect(() => {
        if (selectedGroup) {
            setSqlQuery(`SELECT @timestamp, @message\nFROM \`${selectedGroup}\`\nORDER BY @timestamp DESC\nLIMIT 20`);
        }
    }, [selectedGroup]);

    // Scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [aiMessages, showAiPanel]);

    // Fetch Log Groups
    useEffect(() => {
        const fetchGroups = async () => {
            setLoadingGroups(true);
            if (isMock) {
                setTimeout(() => {
                    const mocks = generateMockLogGroups();
                    const names = mocks.map(g => g.logGroupName);
                    setGroups(names);
                    setFilteredGroups(names);
                    setLoadingGroups(false);
                }, 800);
                return;
            }
            try {
                const client = new CloudWatchLogsClient({
                    region: credentials.region,
                    credentials: {
                        accessKeyId: credentials.accessKeyId,
                        secretAccessKey: credentials.secretAccessKey,
                        sessionToken: credentials.sessionToken || undefined,
                    }
                });
                const command = new DescribeLogGroupsCommand({ limit: 50 }); 
                const response = await client.send(command);
                const fetched = (response.logGroups || []).map(g => g.logGroupName || '').filter(Boolean);
                setGroups(fetched);
                setFilteredGroups(fetched);
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingGroups(false);
            }
        };
        fetchGroups();
    }, [credentials, isMock]);

    // Client-side filter for groups
    useEffect(() => {
        if (!searchGroupTerm) {
            setFilteredGroups(groups);
        } else {
            setFilteredGroups(groups.filter(g => g.toLowerCase().includes(searchGroupTerm.toLowerCase())));
        }
    }, [searchGroupTerm, groups]);

    // Calculate time range
    const getTimeRange = () => {
        let startTimestamp: number;
        let endTimestamp: number = Date.now();

        if (timeMode === 'all') {
            startTimestamp = 0; // Epoch
        } else if (timeMode === 'custom') {
             startTimestamp = new Date(customStart).getTime();
             endTimestamp = new Date(customEnd).getTime();
        } else {
             const now = Date.now();
             let duration = 3600000;
             if (timeMode === '6h') duration = 21600000;
             if (timeMode === '24h') duration = 86400000;
             startTimestamp = now - duration;
        }
        return { startTimestamp, endTimestamp };
    };

    // Run Insights Query
    const runQuery = async () => {
        if (!selectedGroup) return;
        setLoadingLogs(true);
        setQueryResults([]);

        if (isMock) {
            setTimeout(() => {
                const mockResults = [];
                for(let i=0; i<20; i++) {
                    mockResults.push({
                        '@timestamp': new Date(Date.now() - i*60000).toISOString(),
                        '@message': `Mock Log Event ${i} - Something happened`,
                        '@ptr': Math.random().toString(36)
                    });
                }
                setQueryResults(mockResults);
                setLoadingLogs(false);
            }, 1500);
            return;
        }

        try {
            const client = new CloudWatchLogsClient({
                region: credentials.region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken || undefined,
                }
            });

            const { startTimestamp, endTimestamp } = getTimeRange();
            const transpiledQuery = transpileSqlToInsights(sqlQuery);

            const startCommand = new StartQueryCommand({
                logGroupNames: [selectedGroup],
                queryString: transpiledQuery,
                startTime: Math.floor(startTimestamp / 1000),
                endTime: Math.floor(endTimestamp / 1000),
            });
            
            const startResponse = await client.send(startCommand);
            const queryId = startResponse.queryId;
            
            if (!queryId) throw new Error("Failed to start query");

            // Poll for results
            let status = 'Scheduled';
            while (status === 'Scheduled' || status === 'Running') {
                await new Promise(r => setTimeout(r, 1000));
                const resCommand = new GetQueryResultsCommand({ queryId });
                const res = await client.send(resCommand);
                status = res.status || 'Unknown';
                
                if (status === 'Complete') {
                    const results = (res.results || []).map(row => {
                        const obj: any = {};
                        row.forEach(item => {
                            if(item.field) obj[item.field] = item.value;
                        });
                        return obj;
                    });
                    setQueryResults(results);
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingLogs(false);
        }
    };

    // Fetch Stream Logs
    const fetchLogs = async () => {
        if (!selectedGroup) return;
        setLoadingLogs(true);
        if (isMock) {
            setTimeout(() => {
                setLogs(generateMockLogs(logLimit));
                setLoadingLogs(false);
            }, 600);
            return;
        }

        try {
            const client = new CloudWatchLogsClient({
                region: credentials.region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken || undefined,
                }
            });

            const { startTimestamp, endTimestamp } = getTimeRange();

            const command = new FilterLogEventsCommand({
                logGroupName: selectedGroup,
                limit: logLimit,
                startTime: startTimestamp,
                endTime: endTimestamp,
                filterPattern: filterPattern || undefined
            });
            const response = await client.send(command);
            const mapped: LogEvent[] = (response.events || []).map(e => ({
                eventId: e.eventId || '',
                timestamp: e.timestamp || Date.now(),
                message: e.message || '',
                ingestionTime: e.ingestionTime || Date.now()
            })).sort((a,b) => b.timestamp - a.timestamp);
            setLogs(mapped);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingLogs(false);
        }
    };

    // Trigger run based on mode
    const handleRun = () => {
        if (mode === 'stream') fetchLogs();
        else runQuery();
    };

    // AI Chat Logic
    const handleSendMessage = async () => {
        if (!aiInput.trim()) return;
        const userMsg = aiInput;
        setAiInput('');
        setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setAiLoading(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // Format logs context based on mode
            let logContext = '';
            if (mode === 'stream') {
                logContext = logs.slice(0, 50).map(l => {
                    const time = new Date(l.timestamp).toISOString();
                    return `[${time}] ${l.message}`;
                }).join('\n');
            } else {
                logContext = JSON.stringify(queryResults.slice(0, 20), null, 2);
            }

            const prompt = `
            You are a CloudWatch Log Analyzer Assistant.
            
            Context:
            - Log Group: ${selectedGroup}
            - Mode: ${mode}
            - Recent Data (Newest first):
            ${logContext}

            User Question: ${userMsg}

            Instructions:
            - Answer specifically based on the provided logs.
            - If the logs don't contain the answer, say so.
            - Format code or JSON snippets nicely.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });

            setAiMessages(prev => [...prev, { role: 'model', text: response.text || "I couldn't analyze the logs." }]);

        } catch (err) {
            setAiMessages(prev => [...prev, { role: 'model', text: "Error communicating with AI agent." }]);
        } finally {
            setAiLoading(false);
        }
    };

    return (
        <div className="h-[calc(100vh-200px)] min-h-[600px] flex flex-col md:flex-row gap-6 animate-in fade-in slide-in-from-bottom-2">
            
            {/* Sidebar: Log Groups */}
            <Card className="w-full md:w-1/4 flex flex-col p-4">
                <div className="mb-4">
                    <h3 className="font-bold text-[var(--text-main)] mb-2 flex items-center">
                        <Layers className="w-4 h-4 mr-2 text-[var(--accent)]" /> 
                        Log Groups
                    </h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input 
                            type="text" 
                            placeholder="Search groups..."
                            value={searchGroupTerm}
                            onChange={(e) => setSearchGroupTerm(e.target.value)}
                            className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--text-main)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar border border-[var(--border)] rounded-lg bg-[var(--bg-main)]/50">
                    {loadingGroups ? (
                        <div className="p-4 space-y-2">
                            {[1,2,3,4].map(i => <div key={i} className="h-6 bg-[var(--bg-hover)] rounded animate-pulse"></div>)}
                        </div>
                    ) : filteredGroups.length === 0 ? (
                        <div className="p-4 text-[var(--text-muted)] text-sm text-center">No groups found</div>
                    ) : (
                        <div className="divide-y divide-[var(--border)]">
                            {filteredGroups.map(group => (
                                <button
                                    key={group}
                                    onClick={() => { setSelectedGroup(group); setAiMessages([]); setLogs([]); setQueryResults([]); }}
                                    className={`w-full text-left px-3 py-3 text-xs font-mono break-all hover:bg-[var(--bg-hover)] transition-colors ${selectedGroup === group ? 'bg-[var(--accent)]/10 text-[var(--accent)] border-l-2 border-[var(--accent)]' : 'text-[var(--text-muted)] border-l-2 border-transparent'}`}
                                >
                                    {group}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Card>

            {/* Main Content Area: Logs + Optional AI Panel */}
            <div className="flex-1 flex gap-4 overflow-hidden">
                
                {/* Log Viewer Column */}
                <Card className={`p-4 flex flex-col flex-1 overflow-hidden transition-all duration-300 ${showAiPanel ? 'w-2/3' : 'w-full'}`}>
                    
                    {/* Header Controls */}
                    <div className="flex flex-col gap-4 mb-4 pb-4 border-b border-[var(--border)]">
                        <div className="flex items-center justify-between">
                             <h3 className="font-bold text-[var(--text-main)] flex items-center truncate max-w-md" title={selectedGroup || ''}>
                                <Terminal className="w-4 h-4 mr-2 text-[var(--accent)] flex-shrink-0" />
                                <span className="truncate">{selectedGroup || 'Select a Log Group'}</span>
                             </h3>
                             
                             <div className="flex bg-[var(--bg-main)] p-1 rounded-lg border border-[var(--border)]">
                                 <button 
                                    onClick={() => setMode('stream')}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center ${mode === 'stream' ? 'bg-[var(--accent)] text-white shadow' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                 >
                                    <Play className="w-3 h-3 mr-1"/> Stream
                                 </button>
                                 <button 
                                    onClick={() => setMode('query')}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center ${mode === 'query' ? 'bg-[var(--accent)] text-white shadow' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                 >
                                    <Database className="w-3 h-3 mr-1"/> SQL Query
                                 </button>
                             </div>
                        </div>

                        {/* Toolbar */}
                        <div className="flex flex-wrap items-center gap-2">
                             
                             {mode === 'stream' && (
                                <div className="relative flex-1 min-w-[200px]">
                                    <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-[var(--text-muted)]" />
                                    <input 
                                        type="text" 
                                        placeholder="Filter pattern..." 
                                        value={filterPattern}
                                        onChange={(e) => setFilterPattern(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleRun()}
                                        className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-3 pl-8 py-1.5 text-xs text-[var(--text-main)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                                    />
                                </div>
                             )}

                             {/* Shared Controls */}
                             <select 
                                value={timeMode}
                                onChange={(e) => setTimeMode(e.target.value)}
                                className="bg-[var(--bg-main)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text-main)] outline-none"
                            >
                                <option value="1h">Last 1h</option>
                                <option value="6h">Last 6h</option>
                                <option value="24h">Last 24h</option>
                                <option value="all">All Time</option>
                                <option value="custom">Custom Range</option>
                            </select>

                            {mode === 'stream' && (
                                <select 
                                    value={logLimit}
                                    onChange={(e) => setLogLimit(Number(e.target.value))}
                                    className="bg-[var(--bg-main)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text-main)] outline-none"
                                >
                                    <option value={100}>100 lines</option>
                                    <option value={500}>500 lines</option>
                                    <option value={1000}>1000 lines</option>
                                </select>
                            )}

                            {timeMode === 'custom' && (
                                <div className="flex items-center gap-1">
                                    <input type="datetime-local" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-[var(--bg-main)] border border-[var(--border)] rounded px-1 py-1 text-[10px] text-[var(--text-main)] w-28"/>
                                    <span className="text-[var(--text-muted)]">-</span>
                                    <input type="datetime-local" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-[var(--bg-main)] border border-[var(--border)] rounded px-1 py-1 text-[10px] text-[var(--text-main)] w-28"/>
                                </div>
                            )}

                            <Button size="sm" icon={RefreshCw} onClick={handleRun} disabled={!selectedGroup || loadingLogs}>
                                Run
                            </Button>
                            
                            <div className="w-px h-6 bg-[var(--border)] mx-1"></div>
                            
                            <Button 
                                size="sm" 
                                variant={showAiPanel ? "primary" : "secondary"}
                                icon={Sparkles} 
                                onClick={() => setShowAiPanel(!showAiPanel)}
                                disabled={!selectedGroup}
                            >
                                Ask AI
                            </Button>
                        </div>
                    </div>

                    {/* SQL Editor Area */}
                    {mode === 'query' && (
                        <div className="mb-4 h-32 relative group">
                            <textarea 
                                value={sqlQuery}
                                onChange={(e) => setSqlQuery(e.target.value)}
                                className="w-full h-full bg-[#0f172a] text-blue-200 font-mono text-xs p-3 rounded border border-[var(--border)] outline-none resize-none focus:ring-1 focus:ring-[var(--accent)]"
                                placeholder="Enter SQL query..."
                            />
                            <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] text-slate-500">Supports SELECT, WHERE, LIKE, ORDER BY, LIMIT</span>
                            </div>
                        </div>
                    )}

                    {/* Output Area */}
                    <div className="flex-1 bg-[#0f172a] rounded-lg border border-slate-700 shadow-inner overflow-hidden flex flex-col font-mono text-xs">
                         <div className="bg-slate-800 px-4 py-1.5 border-b border-slate-700 flex items-center justify-between">
                             <div className="text-slate-400">
                                {mode === 'stream' ? 'Log Stream' : 'Query Results'}
                             </div>
                             <div className="text-slate-500 text-[10px]">
                                {mode === 'stream' ? `${logs.length} events` : `${queryResults.length} rows`}
                             </div>
                         </div>
                         <div className="flex-1 overflow-y-auto custom-scrollbar p-4 text-slate-300 space-y-1">
                            {!selectedGroup ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                    <List className="w-8 h-8 mb-2 opacity-50"/>
                                    <p>Select a Log Group from the sidebar.</p>
                                </div>
                            ) : loadingLogs ? (
                                <div className="space-y-2 animate-pulse">
                                    <div className="h-4 bg-slate-700 w-3/4 rounded"></div>
                                    <div className="h-4 bg-slate-700 w-1/2 rounded"></div>
                                    <div className="h-4 bg-slate-700 w-2/3 rounded"></div>
                                </div>
                            ) : mode === 'stream' ? (
                                logs.length === 0 ? (
                                    <div className="text-center text-slate-500 mt-10 italic">No events found.</div>
                                ) : (
                                    logs.map((log, i) => {
                                        let content = log.message;
                                        let isJson = false;
                                        try {
                                            const parsed = JSON.parse(log.message);
                                            if (typeof parsed === 'object') {
                                                content = JSON.stringify(parsed, null, 2);
                                                isJson = true;
                                            }
                                        } catch(e) {}

                                        return (
                                            <div key={i} className="flex gap-3 hover:bg-slate-800/50 p-1 rounded group">
                                                <span className="text-slate-500 shrink-0 select-none w-36">{new Date(log.timestamp).toISOString().split('T')[1].replace('Z','')}</span>
                                                <span className={`break-all whitespace-pre-wrap ${isJson ? 'text-green-400' : 'text-slate-300'}`}>
                                                    {content}
                                                </span>
                                            </div>
                                        )
                                    })
                                )
                            ) : (
                                // Query Mode Table
                                queryResults.length === 0 ? (
                                    <div className="text-center text-slate-500 mt-10 italic">No results returned.</div>
                                ) : (
                                    <div className="w-full overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr>
                                                    {Object.keys(queryResults[0] || {}).map(k => (
                                                        <th key={k} className="p-2 border-b border-slate-700 text-slate-400 font-semibold bg-slate-800/50 sticky top-0">{k}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {queryResults.map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-800/30">
                                                        {Object.values(row).map((val, vIdx) => (
                                                            <td key={vIdx} className="p-2 border-b border-slate-700/50 align-top max-w-xs truncate" title={val}>
                                                                {val}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            )}
                         </div>
                    </div>
                </Card>

                {/* AI Chat Panel */}
                {showAiPanel && (
                    <Card className="w-1/3 flex flex-col p-0 border-l border-[var(--border)] rounded-xl overflow-hidden animate-in slide-in-from-right-4">
                        <div className="p-3 bg-[var(--bg-hover)] border-b border-[var(--border)] flex justify-between items-center">
                            <h4 className="font-bold text-[var(--text-main)] flex items-center text-sm">
                                <Bot className="w-4 h-4 mr-2 text-[var(--accent)]" /> 
                                Log Agent
                            </h4>
                            <button onClick={() => setShowAiPanel(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--bg-main)]">
                            {aiMessages.length === 0 && (
                                <div className="text-center text-[var(--text-muted)] text-xs mt-10">
                                    <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>Ask me about the logs shown on the left.</p>
                                    <p className="mt-2 opacity-70">"Why did the request fail?"</p>
                                    <p className="opacity-70">"Count the errors."</p>
                                </div>
                            )}
                            {aiMessages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-lg p-3 text-xs ${msg.role === 'user' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)]'}`}>
                                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                                    </div>
                                </div>
                            ))}
                             {aiLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 text-xs flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce"></div>
                                        <div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce delay-75"></div>
                                        <div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce delay-150"></div>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        <div className="p-3 bg-[var(--bg-card)] border-t border-[var(--border)]">
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={aiInput}
                                    onChange={(e) => setAiInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                    placeholder="Ask about these logs..."
                                    disabled={aiLoading}
                                    className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg pl-3 pr-10 py-2 text-sm text-[var(--text-main)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                                />
                                <button 
                                    onClick={handleSendMessage}
                                    disabled={!aiInput.trim() || aiLoading}
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded disabled:opacity-50"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

const CloudWatchLogsView = ({
    resourceName,
    credentials,
    onBack,
    isMock
}: {
    resourceName: string,
    credentials: AwsCredentials,
    onBack: () => void,
    isMock: boolean
}) => {
    const [logs, setLogs] = useState<LogEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [logGroups, setLogGroups] = useState<string[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const discoverLogGroups = async () => {
             setLoading(true);
             setError(null);

             if (isMock) {
                 setTimeout(() => {
                    setLogGroups([`/aws/bedrock/agent/${resourceName}`, `/aws/lambda/${resourceName}-handler`]);
                    setSelectedGroup(`/aws/bedrock/agent/${resourceName}`);
                    setLogs(generateMockLogs());
                    setLoading(false);
                 }, 800);
                 return;
             }

             try {
                const client = new CloudWatchLogsClient({
                    region: credentials.region,
                    credentials: {
                        accessKeyId: credentials.accessKeyId,
                        secretAccessKey: credentials.secretAccessKey,
                        sessionToken: credentials.sessionToken || undefined,
                    }
                });

                // Strategy: Search for log groups containing the resource name
                const command = new DescribeLogGroupsCommand({
                    logGroupNamePrefix: isMock ? undefined : (resourceName.startsWith('/') ? resourceName : undefined),
                    limit: 5
                });
                
                const response = await client.send(command);
                const groups = (response.logGroups || []).map(g => g.logGroupName || '').filter(Boolean);
                
                // Fallback attempt: if exact prefix fails, maybe try to guess standard patterns
                if (groups.length === 0) {
                     // Common patterns
                     const patterns = [`/aws/bedrock/agent/${resourceName}`, `/aws/lambda/${resourceName}`, resourceName];
                     setLogGroups(patterns); // We can't verify them easily without listing all, so we offer them as potential targets
                     setSelectedGroup(patterns[0]);
                } else {
                     setLogGroups(groups);
                     setSelectedGroup(groups[0]);
                }
             } catch (err: any) {
                 setError(err.message || "Failed to discover log groups");
             } finally {
                 if (!isMock && logGroups.length === 0 && !selectedGroup) {
                      setLoading(false);
                 }
             }
        };
        discoverLogGroups();
    }, [resourceName, credentials]);

    useEffect(() => {
        if (!selectedGroup) return;

        const fetchLogs = async () => {
            setLoading(true);
            try {
                const client = new CloudWatchLogsClient({
                    region: credentials.region,
                    credentials: {
                        accessKeyId: credentials.accessKeyId,
                        secretAccessKey: credentials.secretAccessKey,
                        sessionToken: credentials.sessionToken || undefined,
                    }
                });
                const command = new FilterLogEventsCommand({
                    logGroupName: selectedGroup,
                    limit: 50,
                    startTime: Date.now() - 3600000 // Last hour
                });
                const response = await client.send(command);
                const mapped: LogEvent[] = (response.events || []).map(e => ({
                    eventId: e.eventId || '',
                    timestamp: e.timestamp || Date.now(),
                    message: e.message || '',
                    ingestionTime: e.ingestionTime || Date.now()
                })).sort((a,b) => b.timestamp - a.timestamp);
                setLogs(mapped);
            } catch (err: any) {
                console.warn("Log fetch failed", err);
                // Don't block UI, just show empty
            } finally {
                setLoading(false);
            }
        };

        if (!isMock) fetchLogs();

    }, [selectedGroup, credentials]);

    return (
        <div className="min-h-screen pb-12 theme-transition">
             <div className="bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-20">
                <div className="max-w-6xl mx-auto px-4 py-4">
                    <button onClick={onBack} className="flex items-center text-[var(--text-muted)] hover:text-[var(--text-main)] mb-4 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </button>
                    <div className="flex items-center justify-between">
                         <div>
                            <h1 className="text-xl font-bold text-[var(--text-main)] flex items-center">
                                <Terminal className="w-6 h-6 mr-2 text-[var(--accent)]" />
                                CloudWatch Logs
                            </h1>
                            <p className="text-sm text-[var(--text-muted)] mt-1">
                                Viewing logs for <span className="font-mono text-[var(--accent)]">{resourceName}</span>
                            </p>
                         </div>
                         <div className="flex items-center gap-2">
                             <select 
                                value={selectedGroup || ''}
                                onChange={(e) => setSelectedGroup(e.target.value)}
                                className="bg-[var(--bg-main)] border border-[var(--border)] text-sm rounded px-3 py-1.5 outline-none"
                             >
                                 {logGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                 {logGroups.length === 0 && <option value="">No Log Groups Found</option>}
                             </select>
                             <Button size="sm" icon={RefreshCw} onClick={() => setSelectedGroup(selectedGroup)}>Refresh</Button>
                         </div>
                    </div>
                </div>
             </div>

             <main className="max-w-6xl mx-auto px-4 py-8">
                 <div className="bg-[#0f172a] rounded-lg border border-slate-700 shadow-2xl overflow-hidden font-mono text-xs md:text-sm">
                     <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex items-center justify-between">
                         <div className="flex space-x-2">
                             <div className="w-3 h-3 rounded-full bg-red-500"></div>
                             <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                             <div className="w-3 h-3 rounded-full bg-green-500"></div>
                         </div>
                         <div className="text-slate-400">Log Stream Output</div>
                     </div>
                     <div className="p-4 h-[600px] overflow-y-auto custom-scrollbar text-slate-300 space-y-1">
                         {loading ? (
                             <div className="animate-pulse flex flex-col gap-2">
                                 <div className="h-4 w-1/3 bg-slate-700 rounded"></div>
                                 <div className="h-4 w-2/3 bg-slate-700 rounded"></div>
                                 <div className="h-4 w-1/2 bg-slate-700 rounded"></div>
                             </div>
                         ) : logs.length === 0 ? (
                             <div className="text-slate-500 italic p-4 text-center">No logs found in the selected time range.</div>
                         ) : (
                             logs.map((log, i) => (
                                 <div key={i} className="flex gap-4 hover:bg-slate-800/50 p-1 rounded">
                                     <span className="text-slate-500 shrink-0 select-none">{new Date(log.timestamp).toISOString()}</span>
                                     <span className="break-all whitespace-pre-wrap">{log.message}</span>
                                 </div>
                             ))
                         )}
                     </div>
                 </div>
             </main>
        </div>
    );
};

const BedrockRuntimeRow = ({
    runtime,
    credentials,
    isMock,
    onViewLogs
}: {
    runtime: BedrockRuntime,
    credentials: AwsCredentials,
    isMock: boolean,
    onViewLogs: (runtimeId: string) => void
}) => {
    const [details, setDetails] = useState<any>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const toggleDetails = async () => {
        const nextState = !expanded;
        setExpanded(nextState);

        if (nextState && !details) {
            setLoadingDetails(true);
            if (isMock) {
                setTimeout(() => {
                    setDetails({
                        ...runtime.raw,
                        detailedDescription: "Mocked detail data from GetAgentRuntimeCommand",
                        configuration: { version: "1.0.2", memory: "1024MB" }
                    });
                    setLoadingDetails(false);
                }, 600);
                return;
            }

            try {
                // @ts-ignore
                const { BedrockAgentCoreControlClient, GetAgentRuntimeCommand } = await import("https://esm.sh/@aws-sdk/client-bedrock-agentcore-control?bundle");
                const client = new BedrockAgentCoreControlClient({
                    region: credentials.region,
                    credentials: {
                        accessKeyId: credentials.accessKeyId,
                        secretAccessKey: credentials.secretAccessKey,
                        sessionToken: credentials.sessionToken || undefined,
                    }
                });
                
                // Using agentRuntimeId for the get command
                const command = new GetAgentRuntimeCommand({ agentRuntimeId: runtime.agentRuntimeId });
                const response = await client.send(command);
                setDetails(response.agentRuntime || response);

            } catch (err) {
                console.error("Failed to fetch runtime details", err);
                setDetails({ error: "Failed to fetch detailed information." });
            } finally {
                setLoadingDetails(false);
            }
        }
    };

    return (
        <Card className="flex flex-col gap-4">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div className="flex-1">
                     <div className="flex items-center gap-3 mb-2">
                         <Cpu className="w-5 h-5 text-[var(--accent)]" />
                         <h3 className="font-bold text-[var(--text-main)] text-lg">{runtime.agentRuntimeId}</h3>
                         <span className={`px-2 py-0.5 text-[10px] rounded border font-mono uppercase ${runtime.status === 'AVAILABLE' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
                             {runtime.status}
                         </span>
                     </div>
                     <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                         <span className="flex items-center"><Clock className="w-3 h-3 mr-1"/> Created: {runtime.updatedAt.toLocaleDateString()}</span>
                     </div>
                 </div>
                 <Button variant="secondary" icon={Search} onClick={() => onViewLogs(runtime.agentRuntimeId)}>
                     CloudWatch Logs
                 </Button>
             </div>

             {/* Details Expansion */}
             <div>
                <button 
                    onClick={toggleDetails}
                    className="flex items-center text-xs text-[var(--accent)] hover:underline outline-none"
                >
                    {expanded ? <ChevronDown className="w-3 h-3 mr-1"/> : <ChevronRight className="w-3 h-3 mr-1"/>}
                    {expanded ? 'Hide Details' : 'View Full Details (GetAgentRuntime)'}
                </button>
                
                {expanded && (
                    <div className="mt-3 bg-[var(--bg-main)] rounded-lg p-3 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] overflow-x-auto">
                        {loadingDetails ? (
                            <div className="flex items-center space-x-2 animate-pulse">
                                <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full"></div>
                                <div>Fetching details...</div>
                            </div>
                        ) : (
                            <pre>{JSON.stringify(details, null, 2)}</pre>
                        )}
                    </div>
                )}
             </div>
        </Card>
    );
};

const BedrockRuntimeList = ({
    credentials,
    isMock,
    onViewLogs
}: {
    credentials: AwsCredentials,
    isMock: boolean,
    onViewLogs: (runtimeId: string) => void
}) => {
    const [runtimes, setRuntimes] = useState<BedrockRuntime[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRuntimes = async () => {
            setLoading(true);
            if (isMock) {
                setTimeout(() => {
                    setRuntimes(generateMockBedrockRuntimes());
                    setLoading(false);
                }, 1000);
                return;
            }

            try {
                // @ts-ignore
                const { BedrockAgentCoreControlClient, ListAgentRuntimesCommand } = await import("https://esm.sh/@aws-sdk/client-bedrock-agentcore-control?bundle");
                
                const client = new BedrockAgentCoreControlClient({
                    region: credentials.region,
                    credentials: {
                        accessKeyId: credentials.accessKeyId,
                        secretAccessKey: credentials.secretAccessKey,
                        sessionToken: credentials.sessionToken || undefined,
                    }
                });

                const command = new ListAgentRuntimesCommand({});
                const response = await client.send(command);
                
                const mapped = (response.agentRuntimes || []).map((r: any) => ({
                    agentRuntimeId: r.agentRuntimeId || r.runtimeId || 'unknown',
                    agentName: r.agentName || 'Unknown Agent',
                    status: r.status || 'UNKNOWN',
                    updatedAt: r.createdAt ? new Date(r.createdAt) : new Date(),
                    raw: r
                }));

                setRuntimes(mapped);

            } catch (err: any) {
                console.error("Bedrock Fetch Error", err);
                setError("Failed to fetch Bedrock Agent Runtimes. The client library may not be available or credentials are invalid. Switch to Demo Mode to visualize.");
            } finally {
                setLoading(false);
            }
        };
        fetchRuntimes();
    }, [credentials, isMock]);

    if (loading) return <div className="p-8 text-center text-[var(--text-muted)] animate-pulse">Loading Runtimes...</div>;
    if (error) return <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5"/>{error}</div>;

    return (
        <div className="space-y-4">
             {runtimes.length === 0 ? (
                 <div className="text-center py-12 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
                     <p className="text-[var(--text-muted)]">No Bedrock Agent Runtimes found.</p>
                 </div>
             ) : (
                 runtimes.map((runtime) => (
                    <BedrockRuntimeRow 
                        key={runtime.agentRuntimeId}
                        runtime={runtime}
                        credentials={credentials}
                        isMock={isMock}
                        onViewLogs={onViewLogs}
                    />
                 ))
             )}
        </div>
    );
}

const InvestigationView = ({ 
    item, 
    credentials, 
    onBack, 
    isMock 
}: { 
    item: InventoryItem, 
    credentials: AwsCredentials, 
    onBack: () => void,
    isMock: boolean 
}) => {
    const [events, setEvents] = useState<CloudTrailEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchEvents = async () => {
            setLoading(true);
            setError(null);
            
            if (isMock) {
                setTimeout(() => {
                    setEvents(generateMockEvents(item.resourceId));
                    setLoading(false);
                }, 1000);
                return;
            }

            try {
                const client = new CloudTrailClient({
                    region: credentials.region,
                    credentials: {
                        accessKeyId: credentials.accessKeyId,
                        secretAccessKey: credentials.secretAccessKey,
                        sessionToken: credentials.sessionToken || undefined,
                    }
                });

                const command = new LookupEventsCommand({
                    LookupAttributes: [
                        { AttributeKey: 'ResourceName', AttributeValue: item.resourceId }
                    ],
                    MaxResults: 50
                });

                const response = await client.send(command);
                const mappedEvents = (response.Events || []).map(e => ({
                    EventId: e.EventId || Math.random().toString(),
                    EventName: e.EventName || 'Unknown',
                    EventTime: e.EventTime ? new Date(e.EventTime) : new Date(),
                    Username: e.Username || 'Unknown',
                    EventSource: e.EventSource || '',
                    Resources: e.Resources || [],
                    CloudTrailEvent: e.CloudTrailEvent || '{}'
                }));
                
                setEvents(mappedEvents);
            } catch (err: any) {
                console.error("CloudTrail Error:", err);
                setError(err.message || "Failed to fetch CloudTrail events");
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
    }, [item, credentials, isMock]);

    return (
        <div className="min-h-screen pb-12 theme-transition">
             {/* Header */}
             <div className="bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-20">
                <div className="max-w-5xl mx-auto px-4 py-4">
                    <button 
                        onClick={onBack}
                        className="flex items-center text-[var(--text-muted)] hover:text-[var(--text-main)] mb-4 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Inventory
                    </button>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center space-x-3 mb-1">
                                <h1 className="text-2xl font-bold text-[var(--text-main)]">{item.resourceId}</h1>
                                <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-xs border border-green-500/20 rounded-full font-medium flex items-center">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></div> Live
                                </span>
                            </div>
                            <div className="text-[var(--text-muted)] font-mono text-xs break-all opacity-80">
                                {item.arn}
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="text-right">
                                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold">Service</div>
                                <div className="text-[var(--text-main)] font-medium capitalize">{item.service}</div>
                            </div>
                            <div className="w-px h-8 bg-[var(--border)]"></div>
                             <div className="text-right">
                                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold">Region</div>
                                <div className="text-[var(--text-main)] font-medium">{credentials.region}</div>
                            </div>
                        </div>
                    </div>
                </div>
             </div>

             <main className="max-w-5xl mx-auto px-4 py-8">
                <h2 className="text-lg font-bold text-[var(--text-main)] mb-6 flex items-center">
                    <Activity className="w-5 h-5 mr-2 text-[var(--accent)]" /> 
                    Audit Trail (CloudTrail)
                </h2>

                {loading ? (
                    <div className="space-y-4">
                         {[1,2,3].map(i => (
                             <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] h-24 rounded-xl animate-pulse"></div>
                         ))}
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-200 flex items-center">
                        <AlertTriangle className="w-5 h-5 mr-3" />
                        {error}
                    </div>
                ) : events.length === 0 ? (
                    <div className="text-center py-12 bg-[var(--bg-card)] rounded-xl border border-dashed border-[var(--border)]">
                        <div className="bg-[var(--bg-hover)] inline-flex p-4 rounded-full mb-4">
                            <FileJson className="w-6 h-6 text-[var(--text-muted)]" />
                        </div>
                        <h3 className="text-[var(--text-main)] font-medium">No events found</h3>
                        <p className="text-[var(--text-muted)] text-sm mt-1 max-w-md mx-auto">
                            CloudTrail returned no "Write" events for this resource name in the last 90 days. 
                            Note: Some services lookup by ARN, others by Name.
                        </p>
                    </div>
                ) : (
                    <div className="relative border-l border-[var(--border)] ml-3 space-y-8 pl-8">
                        {events.map((event, idx) => {
                            const detail = JSON.parse(event.CloudTrailEvent);
                            const isError = detail.errorCode || detail.errorMessage;
                            const isDelete = event.EventName.toLowerCase().includes('delete');
                            const isCreate = event.EventName.toLowerCase().includes('create') || event.EventName.toLowerCase().includes('run');
                            
                            let icon = <Edit3 className="w-4 h-4 text-blue-500" />;
                            let colorClass = "border-blue-500/30 bg-blue-500/10";
                            
                            if (isDelete) {
                                icon = <Trash2 className="w-4 h-4 text-red-500" />;
                                colorClass = "border-red-500/30 bg-red-500/10";
                            } else if (isCreate) {
                                icon = <PlusCircle className="w-4 h-4 text-green-500" />;
                                colorClass = "border-green-500/30 bg-green-500/10";
                            } else if (isError) {
                                icon = <XCircle className="w-4 h-4 text-orange-500" />;
                                colorClass = "border-orange-500/30 bg-orange-500/10";
                            }

                            return (
                                <div key={event.EventId} className="relative group">
                                    <div className={`absolute -left-[41px] top-4 w-6 h-6 rounded-full border flex items-center justify-center bg-[var(--bg-card)] z-10 ${isError ? 'border-red-500 text-red-500' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
                                       {isError ? <AlertTriangle className="w-3 h-3" /> : <div className="w-2 h-2 rounded-full bg-[var(--border)]"></div>}
                                    </div>
                                    
                                    <Card className={`hover:border-[var(--accent)] transition-colors ${isError ? 'border-red-500/30' : ''}`}>
                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-3">
                                            <div className="flex items-start space-x-3">
                                                <div className={`p-2 rounded-lg border ${colorClass}`}>
                                                    {icon}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-[var(--text-main)] flex items-center">
                                                        {event.EventName}
                                                        {isError && <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded uppercase">Failed</span>}
                                                    </h3>
                                                    <div className="flex items-center text-xs text-[var(--text-muted)] mt-1 space-x-3">
                                                        <span className="flex items-center">
                                                            <Calendar className="w-3 h-3 mr-1" />
                                                            {event.EventTime.toLocaleString()}
                                                        </span>
                                                        <span className="flex items-center">
                                                            <User className="w-3 h-3 mr-1" />
                                                            {event.Username}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-main)] px-2 py-1 rounded border border-[var(--border)]">
                                                {detail.sourceIPAddress || 'Unknown IP'}
                                            </div>
                                        </div>
                                        
                                        <details className="group/details">
                                            <summary className="text-xs text-[var(--accent)] cursor-pointer hover:underline select-none font-medium flex items-center">
                                                Show API Parameters
                                            </summary>
                                            <div className="mt-3 bg-[var(--bg-main)] rounded-lg p-3 overflow-x-auto border border-[var(--border)]">
                                                <pre className="text-[10px] font-mono text-[var(--text-muted)] leading-relaxed">
                                                    {JSON.stringify(detail.requestParameters, null, 2)}
                                                </pre>
                                            </div>
                                        </details>
                                    </Card>
                                </div>
                            );
                        })}
                    </div>
                )}
             </main>
        </div>
    );
};

// --- Main Application ---

const App = () => {
  const [credentials, setCredentials] = useState<AwsCredentials | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [serviceChartType, setServiceChartType] = useState<'pie' | 'bar'>('pie');
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'inventory' | 'bedrock' | 'logs'>('inventory');
  const [view, setView] = useState<'dashboard' | 'investigate' | 'cwlogs'>('dashboard');
  const [selectedResource, setSelectedResource] = useState<InventoryItem | null>(null);
  const [selectedLogResource, setSelectedLogResource] = useState<string | null>(null);

  // Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [tagFilters, setTagFilters] = useState<TagFilter[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');

  // AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Form State
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [region, setRegion] = useState('eu-west-1');

  // --- Theme Effect ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // --- Logic ---

  const fetchResources = async (creds: AwsCredentials, targetRegion: string, useMock: boolean) => {
    setLoading(true);
    setLoadingStatus(`Connecting to ${targetRegion}...`);
    setError(null);
    setAiAnalysis(null);
    setTagFilters([]); // Reset filters on new scan

    if (useMock) {
        setTimeout(() => {
          setInventory(generateMockInventory());
          setCredentials({ ...creds, region: targetRegion });
          setLoading(false);
        }, 800);
        return;
    }

    try {
        const client = new ResourceGroupsTaggingAPIClient({
            region: targetRegion,
            credentials: {
              accessKeyId: creds.accessKeyId,
              secretAccessKey: creds.secretAccessKey,
              sessionToken: creds.sessionToken || undefined,
            }
        });

        let allFetchedResources: any[] = [];
        let paginationToken: string | undefined = undefined;
        let pageCount = 0;
        const MAX_PAGES = 50; 

        setLoadingStatus(`Scanning ${targetRegion} for resources...`);

        do {
            const command: any = new GetResourcesCommand({
                ResourcesPerPage: 100,
                PaginationToken: paginationToken,
            });
            
            const response = await client.send(command);
            if (response.ResourceTagMappingList) {
                allFetchedResources = [...allFetchedResources, ...response.ResourceTagMappingList];
                setLoadingStatus(`Found ${allFetchedResources.length} resources...`);
            }
            paginationToken = response.PaginationToken;
            pageCount++;
        } while (paginationToken && pageCount < MAX_PAGES);
        
        const mappedInventory: InventoryItem[] = allFetchedResources.map(r => {
            const arn = r.ResourceARN || '';
            const { service, resourceType, resourceId } = parseArn(arn);
            return {
            arn: arn,
            service: service,
            resourceType: resourceType,
            resourceId: resourceId,
            tags: mapTags(r.Tags)
            };
        });

        setInventory(mappedInventory);
        // Important: Update credentials with new region so UI stays in sync
        setCredentials({ ...creds, region: targetRegion });

    } catch (err: any) {
        console.error(err);
        if (err.message && err.message.includes("Network Error")) {
            setError("Network Error: AWS CORS policy blocked the request. Try 'Use Demo Data' or a proxy.");
        } else {
            setError(err.message || "Failed to fetch resources.");
        }
    } finally {
        setLoading(false);
        setLoadingStatus('');
    }
  };

  const handleLogin = async (useMock = false) => {
    if (!useMock && (!accessKeyId || !secretAccessKey)) {
      setError("Please provide credentials.");
      return;
    }

    // Clean inputs to prevent whitespace-related auth errors
    const cleanAccessKeyId = useMock ? 'mock' : accessKeyId.trim();
    const cleanSecretAccessKey = useMock ? 'mock' : secretAccessKey.trim();
    const cleanSessionToken = sessionToken.trim();

    const creds: AwsCredentials = {
        accessKeyId: cleanAccessKeyId,
        secretAccessKey: cleanSecretAccessKey,
        sessionToken: cleanSessionToken === '' ? undefined : cleanSessionToken,
        region: region
    };

    await fetchResources(creds, region, useMock);
  };

  const handleLogout = () => {
    setCredentials(null);
    setInventory([]);
    setAccessKeyId('');
    setSecretAccessKey('');
    setSessionToken('');
    setError(null);
    setAiAnalysis(null);
    setView('dashboard');
    setActiveTab('inventory');
    setSelectedResource(null);
    setTagFilters([]);
  };

  const handleRegionChange = async (newRegion: string) => {
      if (!credentials) return;
      // Use existing credentials but new region
      await fetchResources(credentials, newRegion, credentials.accessKeyId === 'mock');
  };

  const handleInvestigate = (item: InventoryItem) => {
      setSelectedResource(item);
      setView('investigate');
  };

  const handleViewCwLogs = (resourceName: string) => {
      setSelectedLogResource(resourceName);
      setView('cwlogs');
  };

  const handleBackToDashboard = () => {
      setView('dashboard');
      setSelectedResource(null);
      setSelectedLogResource(null);
  };

  const generateAnalysis = async () => {
    if (analyzing || inventory.length === 0) return;
    setAnalyzing(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const serviceCounts = inventory.reduce((acc, item) => {
        acc[item.service] = (acc[item.service] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const sampleTags = inventory.slice(0, 15).map(i => `${i.resourceId}: ${JSON.stringify(i.tags)}`).join('; ');

      const prompt = `
        You are an AWS Cloud Inventory Auditor. 
        Analyze the following summary of existing resources in region ${credentials?.region}.
        
        Resource Counts by Service:
        ${JSON.stringify(serviceCounts, null, 2)}
        
        Sample Tagging Data (first 15 items):
        ${sampleTags}

        Provide a brief audit report in Markdown:
        1. **Inventory Overview**: What is the primary workload based on resource types?
        2. **Tagging Compliance**: Are resources properly tagged based on the sample?
        3. **Optimization Hint**: Suggest one area to look for cost savings or cleanup.
        
        Keep it concise (under 200 words).
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      setAiAnalysis(response.text || "No analysis generated.");
    } catch (e) {
      setAiAnalysis("Failed to generate AI analysis.");
    } finally {
      setAnalyzing(false);
    }
  };

  // --- Filter Logic ---
  
  const addTagFilter = () => {
      if (!newTagKey || !newTagValue) return;
      // Prevent duplicates
      if (tagFilters.some(f => f.key === newTagKey && f.value === newTagValue)) return;
      
      setTagFilters([...tagFilters, { key: newTagKey, value: newTagValue }]);
      setNewTagKey('');
      setNewTagValue('');
  };

  const removeTagFilter = (index: number) => {
      const newFilters = [...tagFilters];
      newFilters.splice(index, 1);
      setTagFilters(newFilters);
  };

  // Derived State for Filters
  const uniqueTagKeys = useMemo(() => {
      const keys = new Set<string>();
      inventory.forEach(item => {
          Object.keys(item.tags).forEach(k => keys.add(k));
      });
      return Array.from(keys).sort();
  }, [inventory]);

  const uniqueTagValues = useMemo(() => {
      if (!newTagKey) return [];
      const values = new Set<string>();
      inventory.forEach(item => {
          if (item.tags[newTagKey]) {
              values.add(item.tags[newTagKey]);
          }
      });
      return Array.from(values).sort();
  }, [inventory, newTagKey]);

  const filteredInventory = useMemo(() => {
    return inventory.filter(e => {
      // 1. Text Search
      const matchesSearch = 
        e.resourceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.resourceType.toLowerCase().includes(searchTerm.toLowerCase());
      
      // 2. Tag Filter (AND Logic)
      const matchesTags = tagFilters.every(filter => {
          return e.tags[filter.key] === filter.value;
      });

      return matchesSearch && matchesTags;
    });
  }, [inventory, searchTerm, tagFilters]);

  const groupedInventory = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {};
    filteredInventory.forEach(e => {
      if (!groups[e.service]) groups[e.service] = [];
      groups[e.service].push(e);
    });
    return groups;
  }, [filteredInventory]);

  const serviceStats = useMemo(() => {
    return Object.entries(groupedInventory)
      .map(([name, items]) => ({ name, count: items.length }))
      .sort((a, b) => b.count - a.count);
  }, [groupedInventory]);

  // --- Render ---

  if (!credentials) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 theme-transition">
         <button 
            onClick={toggleTheme} 
            className="absolute top-4 right-4 p-2 rounded-full bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors border border-[var(--border)]"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

        <div className="max-w-md w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-center mb-8">
            <div className="w-12 h-12 bg-[var(--accent)] rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/50">
              <Shield className="text-white w-7 h-7" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-2 text-[var(--text-main)]">AWS Resource Overseer</h1>
          <p className="text-[var(--text-muted)] text-center mb-8">
            Scan and visualize existing resources in your account.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Access Key ID</label>
              <input 
                type="text" 
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-4 py-2 text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent outline-none"
                placeholder="AKIA..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Secret Access Key</label>
              <input 
                type="password" 
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-4 py-2 text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent outline-none"
                placeholder="Secret key..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Session Token <span className="opacity-50">(Optional)</span></label>
              <input 
                type="password" 
                value={sessionToken}
                onChange={(e) => setSessionToken(e.target.value)}
                className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-4 py-2 text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent outline-none"
                placeholder="Session Token..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Region</label>
              <div className="relative">
                <select 
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-4 py-2 text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent outline-none appearance-none"
                >
                  {AWS_REGIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code} ({r.name})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            <Button onClick={() => handleLogin(false)} className="w-full" disabled={loading} icon={Key}>
              {loading ? (loadingStatus || 'Scanning...') : 'Scan Resources'}
            </Button>
            
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-[var(--bg-card)] text-[var(--text-muted)]">Or for testing</span>
              </div>
            </div>

            <Button onClick={() => handleLogin(true)} variant="secondary" className="w-full" disabled={loading}>
              Use Demo Data (No Keys)
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --- View Switching Logic ---
  if (view === 'investigate' && selectedResource) {
      return (
          <InvestigationView 
            item={selectedResource} 
            credentials={credentials} 
            onBack={handleBackToDashboard} 
            isMock={credentials.accessKeyId === 'mock'}
          />
      );
  }

  if (view === 'cwlogs' && selectedLogResource) {
      return (
          <CloudWatchLogsView
            resourceName={selectedLogResource}
            credentials={credentials}
            onBack={handleBackToDashboard}
            isMock={credentials.accessKeyId === 'mock'}
          />
      )
  }

  return (
    <div className="min-h-screen pb-12 theme-transition">
      {/* Header */}
      <header className="bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="bg-[var(--accent)] p-2 rounded-lg">
              <Box className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-main)]">AWS Inventory</h1>
              <div className="flex items-center text-xs text-[var(--text-muted)]">
                <span className={`w-2 h-2 bg-green-500 rounded-full mr-1.5 ${loading ? 'animate-ping' : 'animate-pulse'}`}></span>
                {loading ? loadingStatus : `Connected to ${credentials.region}`}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
             {/* In-App Region Switcher */}
            <div className="relative min-w-[200px] hidden md:block">
                <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                <select 
                  value={credentials.region}
                  disabled={loading}
                  onChange={(e) => handleRegionChange(e.target.value)}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg pl-9 pr-8 py-1.5 text-sm text-[var(--text-main)] focus:ring-1 focus:ring-[var(--accent)] outline-none appearance-none cursor-pointer disabled:opacity-50"
                >
                  {AWS_REGIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-[var(--text-muted)] pointer-events-none" />
            </div>

            <button 
              onClick={toggleTheme} 
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="h-6 w-px bg-[var(--border)]"></div>
            <Button variant="ghost" icon={LogOut} onClick={handleLogout}>Disconnect</Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-2">
            <div className="flex space-x-6 border-b border-[var(--border)]">
                <button 
                    onClick={() => setActiveTab('inventory')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'inventory' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <Layers className="w-4 h-4"/> Resource Overseer
                </button>
                <button 
                     onClick={() => setActiveTab('bedrock')}
                     className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'bedrock' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <Cpu className="w-4 h-4"/> Bedrock Agent Core
                </button>
                <button 
                     onClick={() => setActiveTab('logs')}
                     className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'logs' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <Terminal className="w-4 h-4"/> CloudWatch Logs
                </button>
            </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {activeTab === 'logs' ? (
             <LogExplorer credentials={credentials} isMock={credentials.accessKeyId === 'mock'} />
        ) : activeTab === 'bedrock' ? (
             <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                 <div>
                     <h2 className="text-2xl font-bold text-[var(--text-main)]">Agent Core Runtimes</h2>
                     <p className="text-[var(--text-muted)]">Manage and inspect Amazon Bedrock Agent Runtimes and their logs.</p>
                 </div>
                 <BedrockRuntimeList 
                    credentials={credentials} 
                    isMock={credentials.accessKeyId === 'mock'} 
                    onViewLogs={handleViewCwLogs} 
                 />
             </div>
        ) : (
            <>
                {/* Top Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                    <div className="flex justify-between items-start">
                    <div>
                        <p className="text-[var(--text-muted)] text-sm font-medium">Total Resources</p>
                        <h3 className="text-3xl font-bold text-[var(--text-main)] mt-2">{filteredInventory.length}</h3>
                    </div>
                    <div className="bg-blue-500/20 p-2 rounded-lg">
                        <Layers className="w-5 h-5 text-blue-400" />
                    </div>
                    </div>
                    <div className="mt-4 text-xs text-[var(--text-muted)]">
                    Across {serviceStats.length} services
                    </div>
                </Card>

                <Card>
                    <div className="flex justify-between items-start">
                    <div>
                        <p className="text-[var(--text-muted)] text-sm font-medium">Active Services</p>
                        <h3 className="text-3xl font-bold text-[var(--text-main)] mt-2">{serviceStats.length}</h3>
                    </div>
                    <div className="bg-purple-500/20 p-2 rounded-lg">
                        <Server className="w-5 h-5 text-purple-400" />
                    </div>
                    </div>
                    <div className="mt-4 text-xs text-[var(--text-muted)]">
                    Top: <span className="capitalize">{serviceStats[0]?.name || 'N/A'}</span>
                    </div>
                </Card>

                <Card>
                    <div className="flex justify-between items-start">
                    <div>
                        <p className="text-[var(--text-muted)] text-sm font-medium">Tagged Ratio</p>
                        <h3 className="text-3xl font-bold text-[var(--text-main)] mt-2">
                        {Math.round((filteredInventory.filter(e => Object.keys(e.tags).length > 0).length / (filteredInventory.length || 1)) * 100)}%
                        </h3>
                    </div>
                    <div className="bg-orange-500/20 p-2 rounded-lg">
                        <Tag className="w-5 h-5 text-orange-400" />
                    </div>
                    </div>
                    <div className="mt-4 text-xs text-[var(--text-muted)]">
                    Resources with tags
                    </div>
                </Card>

                <Card className="bg-gradient-to-br from-[var(--accent)]/40 to-[var(--bg-card)] border-[var(--accent)]/20">
                    <div className="h-full flex flex-col justify-between">
                    <div>
                        <div className="flex items-center space-x-2 text-[var(--accent-hover)] mb-2">
                            <BrainCircuit className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">Inventory Audit</span>
                        </div>
                        <p className="text-[var(--text-main)] text-sm opacity-90">
                            {analyzing ? 'Auditing inventory...' : 'Generate an audit report on resource types & tags.'}
                        </p>
                    </div>
                    {!aiAnalysis && !analyzing && (
                        <Button variant="secondary" size="sm" onClick={generateAnalysis} className="mt-3 text-xs w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] border-none text-white">
                            Audit Resources
                        </Button>
                    )}
                    </div>
                </Card>
                </div>

                {/* AI Analysis Result */}
                {aiAnalysis && (
                <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl p-6 animate-fade-in">
                    <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                        <BrainCircuit className="w-5 h-5 text-[var(--accent)]" />
                        <h3 className="text-lg font-semibold text-[var(--text-main)]">Gemini Inventory Audit</h3>
                    </div>
                    <button onClick={() => setAiAnalysis(null)} className="text-[var(--accent)] hover:text-[var(--accent-hover)]">
                        Close
                    </button>
                    </div>
                    <div className="prose prose-invert prose-sm max-w-none text-[var(--text-muted)]">
                    {aiAnalysis.split('\n').map((line, i) => (
                        <p key={i} className="mb-1">{line}</p>
                    ))}
                    </div>
                </div>
                )}

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="min-h-[400px]">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-[var(--text-main)]">Resources by Service</h3>
                        <div className="flex bg-[var(--bg-main)] p-1 rounded-lg border border-[var(--border)]">
                            <button 
                                onClick={() => setServiceChartType('pie')}
                                className={`p-1.5 rounded transition-all ${serviceChartType === 'pie' ? 'bg-[var(--bg-card)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                title="Pie Chart"
                            >
                                <PieIcon size={16} />
                            </button>
                            <button 
                                onClick={() => setServiceChartType('bar')}
                                className={`p-1.5 rounded transition-all ${serviceChartType === 'bar' ? 'bg-[var(--bg-card)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                title="Bar Chart"
                            >
                                <BarChart2 size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        {serviceChartType === 'bar' ? (
                            <BarChart data={serviceStats} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                                <XAxis type="number" stroke="var(--text-muted)" />
                                <YAxis type="category" dataKey="name" stroke="var(--text-muted)" width={80} style={{ textTransform: 'capitalize' }} />
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                    itemStyle={{ color: 'var(--accent)' }}
                                    cursor={{fill: 'var(--bg-hover)', opacity: 0.4}}
                                />
                                <Bar dataKey="count" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={20} name="Resources" />
                            </BarChart>
                        ) : (
                            <PieChart>
                                <Pie
                                    data={serviceStats}
                                    dataKey="count"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={2}
                                    label={({ name, percent }) => percent > 0.05 ? `${name}` : ''}
                                >
                                    {serviceStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="var(--bg-card)" strokeWidth={2}/>
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                />
                                <Legend />
                            </PieChart>
                        )}
                    </ResponsiveContainer>
                    </div>
                </Card>

                <Card className="min-h-[400px]">
                    <h3 className="text-lg font-semibold text-[var(--text-main)] mb-6">Tagging Coverage</h3>
                    <div className="h-[300px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                        <Pie
                            data={[
                            { name: 'Tagged', value: filteredInventory.filter(e => Object.keys(e.tags).length > 0).length },
                            { name: 'Untagged', value: filteredInventory.filter(e => Object.keys(e.tags).length === 0).length }
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            <Cell key="tagged" fill="#10b981" stroke="var(--bg-card)" strokeWidth={2} />
                            <Cell key="untagged" fill="#ef4444" stroke="var(--bg-card)" strokeWidth={2} />
                        </Pie>
                        <RechartsTooltip 
                            contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                        />
                        <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                    </div>
                </Card>
                </div>

                {/* Main Inventory List */}
                <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h2 className="text-2xl font-bold text-[var(--text-main)]">Inventory List</h2>
                    <div className="flex items-center space-x-2 w-full md:w-auto">
                        <div className="relative flex-1 md:min-w-[300px]">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                            <input 
                            type="text" 
                            placeholder="Filter by name, service, or type..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-2 text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent outline-none"
                            />
                        </div>
                        <Button variant={showFilterPanel ? "primary" : "secondary"} icon={Filter} onClick={() => setShowFilterPanel(!showFilterPanel)}>
                            Filters
                        </Button>
                    </div>
                </div>

                {/* Tag Filter Panel */}
                {showFilterPanel && (
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 animate-in slide-in-from-top-2">
                        <div className="flex flex-wrap gap-4 items-end mb-4">
                            <div>
                                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1 uppercase">Filter Key</label>
                                <select 
                                    value={newTagKey}
                                    onChange={(e) => { setNewTagKey(e.target.value); setNewTagValue(''); }}
                                    className="bg-[var(--bg-main)] border border-[var(--border)] rounded p-2 text-sm text-[var(--text-main)] min-w-[150px] outline-none"
                                >
                                    <option value="">Select Key...</option>
                                    {uniqueTagKeys.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1 uppercase">Filter Value</label>
                                <select 
                                    value={newTagValue}
                                    onChange={(e) => setNewTagValue(e.target.value)}
                                    disabled={!newTagKey}
                                    className="bg-[var(--bg-main)] border border-[var(--border)] rounded p-2 text-sm text-[var(--text-main)] min-w-[150px] outline-none disabled:opacity-50"
                                >
                                    <option value="">Select Value...</option>
                                    {uniqueTagValues.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                            </div>
                            <Button size="sm" icon={Plus} onClick={addTagFilter} disabled={!newTagKey || !newTagValue}>Add</Button>
                        </div>
                        
                        {tagFilters.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
                                {tagFilters.map((filter, idx) => (
                                    <span key={idx} className="flex items-center px-3 py-1 bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 rounded-full text-xs font-medium">
                                        <span className="opacity-70 mr-1">{filter.key}:</span>
                                        {filter.value}
                                        <button onClick={() => removeTagFilter(idx)} className="ml-2 hover:text-[var(--text-main)]">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                                <button onClick={() => setTagFilters([])} className="text-xs text-[var(--text-muted)] hover:text-red-400 ml-2 underline">
                                    Clear all
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {serviceStats.map((stat) => (
                    <ServiceGroup 
                    key={stat.name} 
                    service={stat.name} 
                    items={groupedInventory[stat.name]} 
                    onInvestigate={handleInvestigate}
                    />
                ))}
                
                {filteredInventory.length === 0 && (
                    <div className="text-center py-12 text-[var(--text-muted)]">
                        No resources found matching your criteria.
                    </div>
                )}
                </div>
            </>
        )}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);