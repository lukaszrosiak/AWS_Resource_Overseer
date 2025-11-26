import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';
import { 
  Shield, Users, Search, Key, LogOut, 
  AlertTriangle, BrainCircuit, Server, ChevronDown, ChevronRight, Tag, Box, Layers, Hash, Moon, Sun, X, Globe,
  Activity, Calendar, User, FileJson, ArrowLeft, CheckCircle, XCircle, Trash2, Edit3, PlusCircle, Filter, Plus
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { ResourceGroupsTaggingAPIClient, GetResourcesCommand } from "https://esm.sh/@aws-sdk/client-resource-groups-tagging-api?bundle";
import { CloudTrailClient, LookupEventsCommand } from "https://esm.sh/@aws-sdk/client-cloudtrail?bundle";

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

interface TagFilter {
  key: string;
  value: string;
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

// --- Mock Data Generator (for fallback) ---
const generateMockInventory = (): InventoryItem[] => {
  const services = ['ec2', 's3', 'rds', 'lambda', 'dynamodb', 'vpc', 'elasticloadbalancing'];
  const items: InventoryItem[] = [];

  const mockTags = [
    { Environment: 'Production', CostCenter: '1024', Project: 'Alpha' },
    { Environment: 'Staging', Owner: 'Mike' },
    { Application: 'DataPipeline', Tier: 'Backend' },
    { Name: 'BastionHost', ManagedBy: 'Terraform' },
    { 
      'aws:cloudformation:stack-id': 'arn:aws:cloudformation:eu-west-1:123456789012:stack/MyStack/50a123-123-123',
      'aws:cloudformation:logical-id': 'MyInstance',
      'Name': 'Complex-App-Server'
    } 
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
           Investigate
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
  
  // Navigation State
  const [view, setView] = useState<'dashboard' | 'investigate'>('dashboard');
  const [selectedResource, setSelectedResource] = useState<InventoryItem | null>(null);

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

    const creds: AwsCredentials = {
        accessKeyId: useMock ? 'mock' : accessKeyId,
        secretAccessKey: useMock ? 'mock' : secretAccessKey,
        sessionToken: sessionToken,
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

  const handleBackToDashboard = () => {
      setView('dashboard');
      setSelectedResource(null);
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
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
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
            <h3 className="text-lg font-semibold text-[var(--text-main)] mb-6">Resources by Service</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
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
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="min-h-[400px]">
             <h3 className="text-lg font-semibold text-[var(--text-main)] mb-6">Tagging Coverage</h3>
             <div className="h-[300px] w-full flex items-center justify-center">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={[
                                { name: 'Tagged', value: filteredInventory.filter(i => Object.keys(i.tags).length > 0).length },
                                { name: 'Untagged', value: filteredInventory.filter(i => Object.keys(i.tags).length === 0).length }
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                             <Cell fill="#10b981" />
                             <Cell fill="#ef4444" />
                        </Pie>
                        <Legend verticalAlign="bottom" height={36}/>
                        <RechartsTooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-main)' }} />
                    </PieChart>
                 </ResponsiveContainer>
             </div>
          </Card>
        </div>

        {/* Resource Grouped List */}
        <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 className="text-xl font-bold text-[var(--text-main)]">Inventory List</h3>
                <div className="flex items-center gap-2 flex-1 md:justify-end">
                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)] w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Filter by name, service, or type..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-2 text-sm text-[var(--text-main)] focus:ring-1 focus:ring-[var(--accent)] outline-none w-full shadow-sm"
                        />
                    </div>
                    <Button 
                        variant={showFilterPanel || tagFilters.length > 0 ? "primary" : "secondary"} 
                        onClick={() => setShowFilterPanel(!showFilterPanel)}
                        icon={Filter}
                        className="px-3"
                    >
                        Filters
                    </Button>
                </div>
            </div>

            {/* Tag Filter Panel */}
            {(showFilterPanel || tagFilters.length > 0) && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex flex-wrap items-center gap-4 mb-3">
                         <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--text-muted)]">Add Filter:</span>
                            <select 
                                value={newTagKey} 
                                onChange={(e) => { setNewTagKey(e.target.value); setNewTagValue(''); }}
                                className="bg-[var(--bg-main)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-[var(--text-main)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                            >
                                <option value="">Select Key...</option>
                                {uniqueTagKeys.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                            <select 
                                value={newTagValue} 
                                onChange={(e) => setNewTagValue(e.target.value)}
                                disabled={!newTagKey}
                                className="bg-[var(--bg-main)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-[var(--text-main)] outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
                            >
                                <option value="">Select Value...</option>
                                {uniqueTagValues.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                            <Button size="sm" onClick={addTagFilter} disabled={!newTagKey || !newTagValue} icon={Plus}>
                                Add
                            </Button>
                         </div>
                    </div>
                    
                    {tagFilters.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
                             {tagFilters.map((filter, idx) => (
                                 <div key={idx} className="flex items-center bg-[var(--bg-hover)] text-[var(--text-main)] text-xs rounded-full px-3 py-1 border border-[var(--border)]">
                                     <span className="font-bold text-[var(--text-muted)] mr-1">{filter.key}:</span>
                                     <span className="mr-2 font-mono">{filter.value}</span>
                                     <button onClick={() => removeTagFilter(idx)} className="hover:text-red-500">
                                         <X className="w-3 h-3" />
                                     </button>
                                 </div>
                             ))}
                             <button onClick={() => setTagFilters([])} className="text-xs text-[var(--text-muted)] hover:text-red-500 underline ml-2">
                                Clear All
                             </button>
                        </div>
                    )}
                </div>
            )}
        </div>

        <div className="space-y-2">
          {Object.entries(groupedInventory).length > 0 ? (
            Object.entries(groupedInventory).map(([service, items]) => (
              <ServiceGroup key={service} service={service} items={items} onInvestigate={handleInvestigate} />
            ))
          ) : (
             <div className="text-center py-12 bg-[var(--bg-card)]/50 rounded-xl border border-dashed border-[var(--border)]">
               <div className="bg-[var(--bg-card)] inline-flex p-4 rounded-full mb-4">
                 <Hash className="w-6 h-6 text-[var(--text-muted)]" />
               </div>
               <h3 className="text-[var(--text-main)] font-medium">No resources found</h3>
               <p className="text-[var(--text-muted)] text-sm mt-1">
                  We couldn't find any resources matching your filters.
               </p>
             </div>
          )}
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);