
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Key, LogOut, AlertTriangle, BrainCircuit, Server, Tag, Box, Layers, Globe,
  Filter, Plus, X, PieChart as PieIcon, BarChart2, Cpu, Terminal, ChevronDown, Search, Home, Users, ArrowRightLeft, CheckCircle2, RotateCcw, UserCog, Palette, Leaf, MonitorPlay, Check, FileStack
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { ResourceGroupsTaggingAPIClient, GetResourcesCommand } from "https://esm.sh/@aws-sdk/client-resource-groups-tagging-api?bundle";
import { OrganizationsClient, ListAccountsCommand } from "https://esm.sh/@aws-sdk/client-organizations?bundle";
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from "https://esm.sh/@aws-sdk/client-sts?bundle";

import { AwsCredentials, InventoryItem, TagFilter, OrgAccount, GraphNode } from './types';
import { AWS_REGIONS, COLORS } from './constants';
import { parseArn, mapTags } from './utils';
import { generateMockInventory } from './mockData';
import { Button, Card } from './components/UI';
import { ServiceGroup } from './components/Inventory';
import { LogExplorer } from './components/LogExplorer';
import { CloudWatchLogsView } from './components/CloudWatchLogsView';
import { BedrockRuntimeList } from './components/Bedrock';
import { InvestigationView } from './components/InvestigationView';
import { RegionDiscovery } from './components/RegionDiscovery';
import { IamRoles } from './components/IamRoles';
import { DependencyGraph } from './components/DependencyGraph';
import { SSMConnect } from './components/SSMConnect';
import { CloudFormationView } from './components/CloudFormationView';

const THEMES = [
  { id: 'default', name: 'Default' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
  { id: 'tokyonight-storm', name: 'Tokyonight Storm' },
  { id: 'light-aws', name: 'Light AWS' },
  { id: 'dark-aws', name: 'Dark AWS' },
];

export const App = () => {
  const [credentials, setCredentials] = useState<AwsCredentials | null>(null);
  const [originalCredentials, setOriginalCredentials] = useState<AwsCredentials | null>(null);
  const [currentAccount, setCurrentAccount] = useState<{ id: string, name?: string, arn?: string } | null>(null);
  
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>('dark-aws');
  const [serviceChartType, setServiceChartType] = useState<'pie' | 'bar'>('pie');
  const [tagChartType, setTagChartType] = useState<'coverage' | 'environment'>('environment');
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'welcome' | 'inventory' | 'bedrock' | 'logs' | 'discovery' | 'iam' | 'ssm' | 'cloudformation'>('welcome');
  const [view, setView] = useState<'dashboard' | 'investigate' | 'cwlogs' | 'graph'>('dashboard');
  const [selectedResource, setSelectedResource] = useState<InventoryItem | null>(null);
  const [resourceHistory, setResourceHistory] = useState<InventoryItem[]>([]);
  const [selectedLogResource, setSelectedLogResource] = useState<string | null>(null);

  // Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [tagFilters, setTagFilters] = useState<TagFilter[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');
  const [logExplorerFilter, setLogExplorerFilter] = useState('');

  // AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Form State
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [region, setRegion] = useState('eu-west-1');

  // Org Switcher State
  const [orgAccounts, setOrgAccounts] = useState<OrgAccount[]>([]);
  const [targetRoleName, setTargetRoleName] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [switchSuccess, setSwitchSuccess] = useState<string | null>(null);

  // --- Theme Effect ---
  useEffect(() => {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // --- Identity Effect ---
  useEffect(() => {
    const fetchIdentity = async () => {
        if (!credentials) return;

        // Mock Logic
        if (credentials.accessKeyId.startsWith('mock')) {
             if (credentials.accessKeyId.includes('switched') && targetAccountId) {
                 const match = orgAccounts.find(a => a.Id === targetAccountId);
                 setCurrentAccount({ id: targetAccountId, name: match?.Name || 'Switched Account' });
             } else {
                 setCurrentAccount({ id: '123456789012', name: 'Management Account' });
             }
             return;
        }

        try {
            const client = new STSClient({
                region: credentials.region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken || undefined,
                }
            });
            const command = new GetCallerIdentityCommand({});
            const data = await client.send(command);
            
            // Try to resolve name from known org accounts
            const knownAccount = orgAccounts.find(a => a.Id === data.Account);

            setCurrentAccount({ 
                id: data.Account || 'Unknown', 
                name: knownAccount?.Name, 
                arn: data.Arn 
            });
        } catch (err) {
            console.error("Failed to fetch identity", err);
        }
    };
    fetchIdentity();
  }, [credentials, orgAccounts]);

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
            
            const response: any = await client.send(command);
            if (response.ResourceTagMappingList) {
                allFetchedResources = [...allFetchedResources, ...response.ResourceTagMappingList];
                setLoadingStatus(`Found ${(allFetchedResources as any[]).length} resources...`);
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

    setOriginalCredentials(creds);
    await fetchResources(creds, region, useMock);
  };

  const handleLogout = () => {
    setCredentials(null);
    setOriginalCredentials(null);
    setCurrentAccount(null);
    setInventory([]);
    setAccessKeyId('');
    setSecretAccessKey('');
    setSessionToken('');
    setError(null);
    setAiAnalysis(null);
    setView('dashboard');
    setActiveTab('welcome'); // Reset to welcome on logout
    setSelectedResource(null);
    setTagFilters([]);
    setOrgAccounts([]); // Clear org data
    setSwitchSuccess(null);
    setLogExplorerFilter('');
  };

  const handleRegionChange = async (newRegion: string) => {
      if (!credentials) return;
      setRegion(newRegion);
      // Use existing credentials but new region
      await fetchResources(credentials, newRegion, credentials.accessKeyId.startsWith('mock'));
      // If switching from discovery, go to inventory to see results
      if (activeTab === 'discovery') {
          setActiveTab('inventory');
      }
  };

  const fetchOrgAccounts = async () => {
    if (!credentials) return;
    setLoadingOrg(true);
    setError(null);

    if (credentials.accessKeyId.startsWith('mock')) {
        setTimeout(() => {
            setOrgAccounts([
                { Id: '123456789012', Name: 'Management Account', Status: 'ACTIVE', Arn: 'arn:aws:organizations::123:account/o-123/123456789012', Email: 'admin@example.com', OU: 'Root' },
                { Id: '234567890123', Name: 'Production', Status: 'ACTIVE', Arn: 'arn:aws:organizations::123:account/o-123/234567890123', Email: 'prod@example.com', OU: 'Workloads' },
                { Id: '345678901234', Name: 'Development', Status: 'ACTIVE', Arn: 'arn:aws:organizations::123:account/o-123/345678901234', Email: 'dev@example.com', OU: 'Workloads' },
                { Id: '456789012345', Name: 'Staging', Status: 'SUSPENDED', Arn: 'arn:aws:organizations::123:account/o-123/456789012345', Email: 'staging@example.com', OU: 'Sandbox' }
            ]);
            setLoadingOrg(false);
        }, 1000);
        return;
    }

    try {
        const client = new OrganizationsClient({
            region: 'us-east-1', // Org calls are usually global/us-east-1
            credentials: {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken || undefined,
            }
        });

        const command = new ListAccountsCommand({});
        const response = await client.send(command);
        
        const accounts: OrgAccount[] = (response.Accounts || []).map(a => ({
            Id: a.Id!,
            Name: a.Name!,
            Status: a.Status!,
            Arn: a.Arn!,
            Email: a.Email!,
            OU: 'Organization' // Default group since we can't easily fetch OU structure
        }));
        
        setOrgAccounts(accounts);
    } catch (err: any) {
        console.error("Org Fetch Error", err);
        setError("Failed to list organization accounts. Ensure you are using the Management Account or Delegated Administrator.");
    } finally {
        setLoadingOrg(false);
    }
  };

  // Auto-load accounts when on Welcome tab
  useEffect(() => {
    if (activeTab === 'welcome' && credentials && orgAccounts.length === 0 && !loadingOrg && !isAssumedRole) {
        fetchOrgAccounts();
    }
  }, [activeTab, credentials]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwitchAccount = async () => {
      if (!targetAccountId || !targetRoleName || !credentials) {
          setError("Please select an account and enter a role name.");
          return;
      }
      setLoadingOrg(true);
      setError(null);
      setSwitchSuccess(null);

      if (credentials.accessKeyId.startsWith('mock')) {
          setTimeout(() => {
              // Update mock credentials to simulate switch
              const switchedCreds = { ...credentials, accessKeyId: `mock-switched-${targetAccountId}` };
              setCredentials(switchedCreds);
              setSwitchSuccess(`Successfully assumed role ${targetRoleName} in account ${targetAccountId} (Mock)`);
              setLoadingOrg(false);
          }, 1000);
          return;
      }

      try {
          const client = new STSClient({
              region: credentials.region,
              credentials: {
                  accessKeyId: credentials.accessKeyId,
                  secretAccessKey: credentials.secretAccessKey,
                  sessionToken: credentials.sessionToken || undefined,
              }
          });

          const roleArn = `arn:aws:iam::${targetAccountId}:role/${targetRoleName}`;
          const command = new AssumeRoleCommand({
              RoleArn: roleArn,
              RoleSessionName: 'AWSResourceOverseerSession'
          });

          const response = await client.send(command);
          
          if (!response.Credentials) throw new Error("No credentials returned from AssumeRole");

          const newCreds: AwsCredentials = {
              accessKeyId: response.Credentials.AccessKeyId!,
              secretAccessKey: response.Credentials.SecretAccessKey!,
              sessionToken: response.Credentials.SessionToken!,
              region: credentials.region
          };

          // Update main credentials state
          setCredentials(newCreds);
          setSwitchSuccess(`Switched to account ${targetAccountId} as ${targetRoleName}`);
          
          // Auto-refresh resources for the new account
          await fetchResources(newCreds, credentials.region, false);
          
      } catch (err: any) {
          console.error("Switch Account Error", err);
          setError(`Failed to assume role: ${err.message}`);
      } finally {
          setLoadingOrg(false);
      }
  };

  const handleSwitchBack = async () => {
      if (!originalCredentials) return;
      setLoadingOrg(true);
      setCredentials(originalCredentials);
      setSwitchSuccess("Switched back to original account.");
      setError(null);
      
      await fetchResources(originalCredentials, originalCredentials.region, originalCredentials.accessKeyId.startsWith('mock'));
      setLoadingOrg(false);
  };

  const handleInvestigate = (item: InventoryItem) => {
      setSelectedResource(item);
      setView('investigate');
  };

  const handleVisualize = (item: InventoryItem) => {
      setSelectedResource(item);
      setResourceHistory([]); // Reset history when starting new visualization
      setView('graph');
  };

  const handleNodeSelect = (node: GraphNode) => {
     if (selectedResource) {
         setResourceHistory(prev => [...prev, selectedResource]);
     }

     // Construct a temporary InventoryItem to navigate
     const newItem: InventoryItem = {
        resourceId: node.id,
        resourceType: node.type,
        service: node.service,
        // Mocking ARN as it is not present in graph node, usually fine for mock data generation
        arn: `arn:aws:${node.service}:${region}:123456789012:${node.type}/${node.id}`,
        tags: {}
     };
     setSelectedResource(newItem);
  };

  const handleGraphHistoryBack = () => {
      if (resourceHistory.length === 0) return;
      const previous = resourceHistory[resourceHistory.length - 1];
      const newHistory = resourceHistory.slice(0, -1);
      setSelectedResource(previous);
      setResourceHistory(newHistory);
  };

  const handleViewCwLogs = (resourceName: string) => {
      setLogExplorerFilter(resourceName);
      setActiveTab('logs');
      setView('dashboard');
      setSelectedLogResource(null);
  };

  const handleBackToDashboard = () => {
      setView('dashboard');
      setSelectedResource(null);
      setSelectedLogResource(null);
      setResourceHistory([]);
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
      .map(([name, items]) => ({ name, count: (items as InventoryItem[]).length }))
      .sort((a, b) => b.count - a.count);
  }, [groupedInventory]);

  const environmentStats = useMemo(() => {
      const stats: Record<string, number> = {};
      filteredInventory.forEach(item => {
          const env = item.tags['Environment'] || 'Unspecified';
          stats[env] = (stats[env] || 0) + 1;
      });
      return Object.entries(stats).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [filteredInventory]);

  const coverageStats = useMemo(() => [
      { name: 'Tagged', value: filteredInventory.filter(e => Object.keys(e.tags).length > 0).length },
      { name: 'Untagged', value: filteredInventory.filter(e => Object.keys(e.tags).length === 0).length }
  ], [filteredInventory]);

  // Is assumed role?
  const isAssumedRole = useMemo(() => {
      if (!credentials || !originalCredentials) return false;
      return credentials.accessKeyId !== originalCredentials.accessKeyId;
  }, [credentials, originalCredentials]);

  // Group accounts by OU
  const groupedAccounts = useMemo(() => {
      const groups: Record<string, OrgAccount[]> = {};
      orgAccounts.forEach(acc => {
          const key = acc.OU || 'Organization';
          if (!groups[key]) groups[key] = [];
          groups[key].push(acc);
      });
      
      const sortedKeys = Object.keys(groups).sort((a, b) => {
          if (a === 'Root') return -1;
          if (b === 'Root') return 1;
          return a.localeCompare(b);
      });

      return sortedKeys.map(key => ({
          name: key,
          accounts: groups[key].sort((a, b) => a.Name.localeCompare(b.Name))
      }));
  }, [orgAccounts]);

  // --- Render ---

  if (!credentials) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 theme-transition">
        <div className="absolute top-4 right-4 flex items-center bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-1 shadow-sm">
             <Palette className="w-4 h-4 ml-2 mr-1 text-[var(--text-muted)]" />
             <select 
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="bg-transparent text-sm text-[var(--text-main)] outline-none border-none cursor-pointer py-1 pr-1"
             >
                {THEMES.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                ))}
             </select>
        </div>

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
            isMock={credentials.accessKeyId.startsWith('mock')}
          />
      );
  }

  if (view === 'cwlogs' && selectedLogResource) {
      return (
          <CloudWatchLogsView
            resourceName={selectedLogResource}
            credentials={credentials}
            onBack={handleBackToDashboard}
            isMock={credentials.accessKeyId.startsWith('mock')}
          />
      )
  }

  if (view === 'graph' && selectedResource) {
      return (
          <DependencyGraph
            resource={selectedResource}
            onBack={handleBackToDashboard}
            isMock={credentials.accessKeyId.startsWith('mock')}
            onNodeSelect={handleNodeSelect}
            onHistoryBack={handleGraphHistoryBack}
            canGoBack={resourceHistory.length > 0}
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
              <h1 className="text-xl font-bold text-[var(--text-main)]">AWS Resource Overseer</h1>
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

            {/* Account Information Display */}
            {currentAccount && (
                <div className="hidden lg:flex flex-col items-end mr-2 border-r border-[var(--border)] pr-4 pl-4 border-l">
                     <span className="text-xs font-bold text-[var(--text-main)] truncate max-w-[150px]" title={currentAccount.name || 'Account'}>
                         {currentAccount.name || 'Unknown Account'}
                     </span>
                     <span className="text-[10px] font-mono text-[var(--text-muted)]">{currentAccount.id}</span>
                </div>
            )}

            {/* Theme Selector Dropdown */}
            <div className="flex items-center bg-[var(--bg-hover)] rounded-lg px-2 py-1 border border-[var(--border)]">
                <Palette className="w-4 h-4 mr-2 text-[var(--text-muted)]" />
                <select 
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="bg-transparent text-sm text-[var(--text-main)] outline-none border-none cursor-pointer max-w-[100px] truncate"
                >
                    {THEMES.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
            </div>

            <div className="h-6 w-px bg-[var(--border)]"></div>
            <Button variant="ghost" icon={LogOut} onClick={handleLogout}>Disconnect</Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-2">
            <div className="flex space-x-6 border-b border-[var(--border)] overflow-x-auto">
                <button 
                    onClick={() => setActiveTab('welcome')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'welcome' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <Home className="w-4 h-4"/> Welcome
                </button>
                <button 
                    onClick={() => setActiveTab('inventory')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'inventory' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <Layers className="w-4 h-4"/> Resource Overseer
                </button>
                <button 
                    onClick={() => setActiveTab('cloudformation')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'cloudformation' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <FileStack className="w-4 h-4"/> Stacks
                </button>
                <button 
                    onClick={() => setActiveTab('iam')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'iam' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <UserCog className="w-4 h-4"/> IAM Roles
                </button>
                <button 
                    onClick={() => setActiveTab('ssm')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'ssm' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <MonitorPlay className="w-4 h-4"/> Session Manager
                </button>
                <button 
                     onClick={() => setActiveTab('bedrock')}
                     className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'bedrock' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <Cpu className="w-4 h-4"/> Bedrock Agent Core
                </button>
                <button 
                     onClick={() => setActiveTab('logs')}
                     className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'logs' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <Terminal className="w-4 h-4"/> CloudWatch Logs
                </button>
                <button 
                     onClick={() => setActiveTab('discovery')}
                     className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'discovery' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                    <Globe className="w-4 h-4"/> Region Discovery
                </button>
            </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {activeTab === 'welcome' ? (
             <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                <div className="text-center py-6">
                    <div className="inline-flex items-center justify-center p-4 bg-[var(--accent)]/10 rounded-full mb-6">
                        <Shield className="w-12 h-12 text-[var(--accent)]" />
                    </div>
                    <h2 className="text-3xl font-bold text-[var(--text-main)] mb-3">Welcome to AWS Resource Overseer</h2>
                    <p className="text-[var(--text-muted)] max-w-2xl mx-auto text-lg">
                        Your centralized hub for exploring, monitoring, and auditing your AWS infrastructure.
                    </p>
                </div>

                {/* Organization Switcher Panel */}
                <Card className="max-w-4xl mx-auto border-t-4 border-t-[var(--accent)]">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 border-b border-[var(--border)] pb-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-[var(--bg-hover)] p-2 rounded-lg">
                                <Users className="w-5 h-5 text-[var(--text-main)]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-[var(--text-main)]">Organization Switch</h3>
                                <p className="text-xs text-[var(--text-muted)]">Assume a role in another account within your Organization</p>
                            </div>
                        </div>
                    </div>

                    {!isAssumedRole ? (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                            <div className="md:col-span-5">
                                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1 uppercase">Target Account</label>
                                <div className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg h-[200px] overflow-y-auto custom-scrollbar p-1">
                                    {groupedAccounts.length === 0 && !loadingOrg ? (
                                        <div className="text-center text-[var(--text-muted)] text-xs py-8">No accounts found</div>
                                    ) : null}
                                    {groupedAccounts.map((group) => (
                                        <div key={group.name} className="mb-2">
                                            <div className="px-2 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase bg-[var(--bg-main)] sticky top-0 z-10 border-b border-[var(--border)]/50">
                                                {group.name}
                                            </div>
                                            <div className="space-y-0.5 mt-1">
                                                {group.accounts.map(acc => (
                                                    <button
                                                        key={acc.Id}
                                                        onClick={() => setTargetAccountId(acc.Id)}
                                                        className={`w-full text-left px-3 py-2 text-xs rounded-md transition-all border ${
                                                            targetAccountId === acc.Id 
                                                            ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-sm' 
                                                            : 'bg-transparent border-transparent text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                                                        }`}
                                                    >
                                                        <div className="flex justify-between items-center w-full">
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                <span className="font-medium truncate">{acc.Name}</span>
                                                                <span className={`text-[10px] font-mono flex-shrink-0 ${targetAccountId === acc.Id ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                                                                    ({acc.Id})
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                                <span className={`text-[10px] font-bold ${targetAccountId === acc.Id ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>
                                                                    {acc.Status}
                                                                </span>
                                                                {targetAccountId === acc.Id && <Check className="w-3 h-3" />}
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    {loadingOrg && orgAccounts.length === 0 && (
                                        <p className="text-[10px] text-[var(--text-muted)] p-4 text-center italic animate-pulse">Loading organization accounts...</p>
                                    )}
                                </div>
                            </div>
                            <div className="md:col-span-4">
                                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1 uppercase">Role Name</label>
                                <input 
                                    type="text" 
                                    value={targetRoleName}
                                    onChange={(e) => setTargetRoleName(e.target.value)}
                                    placeholder="e.g. OrganizationAccountAccessRole"
                                    className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] focus:ring-1 focus:ring-[var(--accent)] outline-none"
                                />
                            </div>
                            <div className="md:col-span-3">
                                <Button 
                                    className="w-full h-10" 
                                    onClick={handleSwitchAccount} 
                                    disabled={loadingOrg || !targetAccountId}
                                    icon={ArrowRightLeft}
                                >
                                    {loadingOrg ? 'Switching...' : 'Switch Account'}
                                </Button>
                            </div>
                        </div>
                    ) : (
                         <div className="flex flex-col items-center justify-center py-4 space-y-4">
                             <div className="text-center">
                                 <p className="text-[var(--text-main)] font-medium">Currently managing account:</p>
                                 <p className="text-xl font-bold text-[var(--accent)]">{currentAccount?.name || currentAccount?.id}</p>
                                 <p className="text-xs text-[var(--text-muted)] font-mono">{currentAccount?.arn}</p>
                             </div>
                             <Button 
                                onClick={handleSwitchBack}
                                disabled={loadingOrg}
                                icon={RotateCcw}
                                className="bg-[var(--text-main)] hover:bg-[var(--text-muted)] text-[var(--bg-main)]"
                             >
                                 {loadingOrg ? 'Reverting...' : 'Switch Back to Original Account'}
                             </Button>
                         </div>
                    )}

                    {error && (
                         <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg flex items-center text-sm">
                             <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                             {error}
                         </div>
                    )}

                    {switchSuccess && (
                        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 text-green-600 rounded-lg flex items-center text-sm animate-in fade-in">
                            <CheckCircle2 className="w-4 h-4 mr-2 flex-shrink-0" />
                            {switchSuccess}
                        </div>
                    )}
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Card className="hover:border-[var(--accent)] transition-colors cursor-pointer group" onClick={() => setActiveTab('inventory')}>
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                <Layers className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-[var(--text-main)] mb-1">Resource Overseer</h3>
                                <p className="text-[var(--text-muted)] text-sm">
                                    Deep dive into your resource inventory. Visualize distribution by service, check tagging compliance, and generate AI-driven audit reports.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="hover:border-[var(--accent)] transition-colors cursor-pointer group" onClick={() => setActiveTab('cloudformation')}>
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-teal-500/10 text-teal-500 group-hover:bg-teal-500 group-hover:text-white transition-colors">
                                <FileStack className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-[var(--text-main)] mb-1">CloudFormation</h3>
                                <p className="text-[var(--text-muted)] text-sm">
                                    Manage your infrastructure stacks. View status, inspect details, and bulk delete unused stacks.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="hover:border-[var(--accent)] transition-colors cursor-pointer group" onClick={() => setActiveTab('iam')}>
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-pink-500/10 text-pink-500 group-hover:bg-pink-500 group-hover:text-white transition-colors">
                                <UserCog className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-[var(--text-main)] mb-1">IAM Roles</h3>
                                <p className="text-[var(--text-muted)] text-sm">
                                    Search for IAM roles and filter by trusted entities (principals) to secure your organization.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="hover:border-[var(--accent)] transition-colors cursor-pointer group" onClick={() => setActiveTab('ssm')}>
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                <MonitorPlay className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-[var(--text-main)] mb-1">Session Manager</h3>
                                <p className="text-[var(--text-muted)] text-sm">
                                    Connect to EC2 instances instantly via simulated web terminal using AWS Systems Manager.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="hover:border-[var(--accent)] transition-colors cursor-pointer group" onClick={() => setActiveTab('bedrock')}>
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-purple-500/10 text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                                <Cpu className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-[var(--text-main)] mb-1">Bedrock Agent Core</h3>
                                <p className="text-[var(--text-muted)] text-sm">
                                    Monitor and inspect Bedrock Agent Runtimes. View status, details, and access related CloudWatch logs directly.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="hover:border-[var(--accent)] transition-colors cursor-pointer group" onClick={() => setActiveTab('logs')}>
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-orange-500/10 text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                <Terminal className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-[var(--text-main)] mb-1">Log Explorer</h3>
                                <p className="text-[var(--text-muted)] text-sm">
                                    Stream and query CloudWatch Logs in real-time. Use AI assistant to interpret errors and log patterns instantly.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="hover:border-[var(--accent)] transition-colors cursor-pointer group" onClick={() => setActiveTab('discovery')}>
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-green-500/10 text-green-500 group-hover:bg-green-500 group-hover:text-white transition-colors">
                                <Globe className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-[var(--text-main)] mb-1">Region Discovery</h3>
                                <p className="text-[var(--text-muted)] text-sm">
                                    Scan across all AWS regions to discover active VPCs and EC2 instances. Identify forgotten resources globally.
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        ) : activeTab === 'logs' ? (
             <LogExplorer 
                credentials={credentials} 
                isMock={credentials.accessKeyId.startsWith('mock')} 
                initialFilter={logExplorerFilter}
             />
        ) : activeTab === 'bedrock' ? (
             <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                 <div>
                     <h2 className="text-2xl font-bold text-[var(--text-main)]">Agent Core Runtimes</h2>
                     <p className="text-[var(--text-muted)]">Manage and inspect Amazon Bedrock Agent Runtimes and their logs.</p>
                 </div>
                 <BedrockRuntimeList 
                    credentials={credentials} 
                    isMock={credentials.accessKeyId.startsWith('mock')} 
                    onViewLogs={handleViewCwLogs} 
                 />
             </div>
        ) : activeTab === 'ssm' ? (
            <SSMConnect 
                credentials={credentials} 
                isMock={credentials.accessKeyId.startsWith('mock')} 
            />
        ) : activeTab === 'iam' ? (
            <IamRoles 
                credentials={credentials} 
                isMock={credentials.accessKeyId.startsWith('mock')} 
            />
        ) : activeTab === 'cloudformation' ? (
            <CloudFormationView
                credentials={credentials}
                isMock={credentials.accessKeyId.startsWith('mock')}
            />
        ) : activeTab === 'discovery' ? (
            <RegionDiscovery 
                credentials={credentials} 
                isMock={credentials.accessKeyId.startsWith('mock')} 
                onSwitchRegion={handleRegionChange}
            />
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
                    {(aiAnalysis as string).split('\n').map((line, i) => (
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
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-[var(--text-main)]">
                            {tagChartType === 'environment' ? 'Environment Distribution' : 'Tagging Coverage'}
                        </h3>
                        <div className="flex bg-[var(--bg-main)] p-1 rounded-lg border border-[var(--border)]">
                            <button 
                                onClick={() => setTagChartType('environment')}
                                className={`p-1.5 rounded transition-all flex items-center gap-1 text-xs font-medium ${tagChartType === 'environment' ? 'bg-[var(--bg-card)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                title="Environment Distribution"
                            >
                                <Leaf size={14} /> Env
                            </button>
                            <button 
                                onClick={() => setTagChartType('coverage')}
                                className={`p-1.5 rounded transition-all flex items-center gap-1 text-xs font-medium ${tagChartType === 'coverage' ? 'bg-[var(--bg-card)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                title="Tag Coverage"
                            >
                                <Tag size={14} /> Coverage
                            </button>
                        </div>
                    </div>
                    <div className="h-[300px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                        <Pie
                            data={tagChartType === 'environment' ? environmentStats : coverageStats}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            label={tagChartType === 'environment' ? ({ name, percent }) => percent > 0.05 ? `${name}` : '' : undefined}
                        >
                            {tagChartType === 'environment' ? (
                                environmentStats.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} stroke="var(--bg-card)" strokeWidth={2}/>
                                ))
                            ) : (
                                <>
                                    <Cell key="tagged" fill="#10b981" stroke="var(--bg-card)" strokeWidth={2} />
                                    <Cell key="untagged" fill="#ef4444" stroke="var(--bg-card)" strokeWidth={2} />
                                </>
                            )}
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
                    onVisualize={handleVisualize}
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