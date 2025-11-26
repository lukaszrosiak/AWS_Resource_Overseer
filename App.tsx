import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Key, LogOut, AlertTriangle, BrainCircuit, Server, Tag, Box, Layers, Moon, Sun, Globe,
  Filter, Plus, X, PieChart as PieIcon, BarChart2, Cpu, Terminal, ChevronDown, Search
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { ResourceGroupsTaggingAPIClient, GetResourcesCommand } from "https://esm.sh/@aws-sdk/client-resource-groups-tagging-api?bundle";

import { AwsCredentials, InventoryItem, TagFilter } from './types';
import { AWS_REGIONS, COLORS } from './constants';
import { parseArn, mapTags } from './utils';
import { generateMockInventory } from './mockData';
import { Button, Card } from './components/UI';
import { ServiceGroup } from './components/Inventory';
import { LogExplorer } from './components/LogExplorer';
import { CloudWatchLogsView } from './components/CloudWatchLogsView';
import { BedrockRuntimeList } from './components/Bedrock';
import { InvestigationView } from './components/InvestigationView';

export const App = () => {
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