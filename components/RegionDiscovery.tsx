
import React, { useState } from 'react';
import { Globe, Play, Loader2, ArrowRight, Server, Cloud, AlertTriangle, CheckCircle2, Workflow } from 'lucide-react';
import { EC2Client, DescribeVpcsCommand, DescribeInstancesCommand } from "https://esm.sh/@aws-sdk/client-ec2?bundle";
import { CodePipelineClient, ListPipelinesCommand } from "https://esm.sh/@aws-sdk/client-codepipeline?bundle";
import { AwsCredentials } from '../types';
import { AWS_REGIONS } from '../constants';
import { Button, Card } from './UI';

type RegionStatus = 'idle' | 'scanning' | 'active' | 'empty' | 'error';

interface RegionState {
    status: RegionStatus;
    vpcCount?: number;
    ec2Count?: number;
    pipelineCount?: number;
    error?: string;
}

interface RegionDiscoveryProps {
    credentials: AwsCredentials;
    isMock: boolean;
    onSwitchRegion: (region: string) => void;
}

export const RegionDiscovery: React.FC<RegionDiscoveryProps> = ({ credentials, isMock, onSwitchRegion }) => {
    const [scanResults, setScanResults] = useState<Record<string, RegionState>>({});
    const [scanningGroups, setScanningGroups] = useState<Record<string, boolean>>({});

    const scanRegionResources = async (regionCode: string): Promise<{ vpcCount: number, ec2Count: number, pipelineCount: number, error?: string }> => {
        if (isMock) {
            await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
            // Random mock data
            const vpcCount = Math.random() > 0.6 ? Math.floor(Math.random() * 3) + 1 : 0;
            const ec2Count = vpcCount > 0 ? Math.floor(Math.random() * 10) : 0;
            const pipelineCount = vpcCount > 0 ? Math.floor(Math.random() * 5) : 0;
            return { vpcCount, ec2Count, pipelineCount };
        }

        try {
            const ec2Client = new EC2Client({
                region: regionCode,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken || undefined,
                },
                maxAttempts: 2, // Fail fast on connection issues
            });

            const cpClient = new CodePipelineClient({
                region: regionCode,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken || undefined,
                },
                maxAttempts: 2,
            });
            
            // Wrap AWS calls in a timeout promise to prevent hanging on opt-in regions
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Timeout")), 8000)
            );

            // Execute in parallel but handle failures gracefully for services that might not exist in a region
            const apiPromise = Promise.all([
                ec2Client.send(new DescribeVpcsCommand({})),
                ec2Client.send(new DescribeInstancesCommand({ MaxResults: 1000 })),
                cpClient.send(new ListPipelinesCommand({})).catch(() => ({ pipelines: [] })) // Catch CP errors as it might not be available
            ]);

            // @ts-ignore
            const [vpcRes, ec2Res, cpRes] = await Promise.race([apiPromise, timeoutPromise]);

            const vpcCount = (vpcRes.Vpcs || []).length;
            
            let ec2Count = 0;
            (ec2Res.Reservations || []).forEach((res: any) => {
                ec2Count += (res.Instances || []).length;
            });

            const pipelineCount = (cpRes.pipelines || []).length;
            
            return { vpcCount, ec2Count, pipelineCount };
        } catch (e: any) {
            console.warn(`Scan failed for ${regionCode}:`, e);
            // Distinguish between access denied (auth) and timeouts/network (connectivity)
            const errorMsg = e.message === 'Timeout' ? 'Timeout' : 'Access Error';
            return { vpcCount: 0, ec2Count: 0, pipelineCount: 0, error: errorMsg };
        }
    };

    const scanGroup = async (groupName: string, regions: typeof AWS_REGIONS) => {
        setScanningGroups(prev => ({ ...prev, [groupName]: true }));

        // Initialize status for these regions to scanning
        setScanResults(prev => {
            const next = { ...prev };
            regions.forEach(r => {
                next[r.code] = { status: 'scanning' };
            });
            return next;
        });

        // Process in batches
        const batchSize = 5;
        for (let i = 0; i < regions.length; i += batchSize) {
            const batch = regions.slice(i, i + batchSize);
            
            try {
                const results = await Promise.all(batch.map(async (region) => {
                    const result = await scanRegionResources(region.code);
                    return { code: region.code, ...result };
                }));

                // Update state incrementally
                setScanResults(prev => {
                    const next = { ...prev };
                    results.forEach(res => {
                        next[res.code] = {
                            status: (res.vpcCount > 0 || res.ec2Count > 0 || res.pipelineCount > 0) ? 'active' : 'empty',
                            vpcCount: res.vpcCount,
                            ec2Count: res.ec2Count,
                            pipelineCount: res.pipelineCount,
                            error: res.error
                        };
                    });
                    return next;
                });
            } catch (err) {
                console.error("Batch failed", err);
            }
        }

        setScanningGroups(prev => ({ ...prev, [groupName]: false }));
    };

    // Calculate totals
    const regionsWithResources = Object.values(scanResults).filter(s => (s.vpcCount || 0) > 0 || (s.ec2Count || 0) > 0 || (s.pipelineCount || 0) > 0).length;
    const totalVpcs = Object.values(scanResults).reduce((acc, curr) => acc + (curr.vpcCount || 0), 0);
    const totalEc2 = Object.values(scanResults).reduce((acc, curr) => acc + (curr.ec2Count || 0), 0);
    const totalPipelines = Object.values(scanResults).reduce((acc, curr) => acc + (curr.pipelineCount || 0), 0);

    // Grouping Logic
    const getRegionGroup = (code: string) => {
        if (code.startsWith('eu-')) return 'Europe';
        if (code.startsWith('us-')) return 'US';
        if (code.startsWith('ap-')) return 'Asia';
        return 'Other';
    };

    const GROUP_ORDER = ['Europe', 'US', 'Asia', 'Other'];
    
    const groupedRegions = AWS_REGIONS.reduce((acc, region) => {
        const group = getRegionGroup(region.code);
        if (!acc[group]) acc[group] = [];
        acc[group].push(region);
        return acc;
    }, {} as Record<string, typeof AWS_REGIONS>);


    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-[var(--text-main)] flex items-center">
                        <Globe className="w-6 h-6 mr-2 text-[var(--accent)]" />
                        Region Discovery
                    </h2>
                    <p className="text-[var(--text-muted)] mt-1">
                        Scan for active VPCs, EC2 Instances, and CodePipelines across all AWS regions.
                    </p>
                </div>
            </div>

            {regionsWithResources > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <Card className="p-4 flex flex-col justify-center bg-blue-500/5 border-blue-500/20">
                        <span className="text-[var(--text-muted)] text-xs font-bold uppercase">Active Regions</span>
                        <span className="text-2xl font-bold text-blue-500">{regionsWithResources}</span>
                    </Card>
                    <Card className="p-4 flex flex-col justify-center">
                         <span className="text-[var(--text-muted)] text-xs font-bold uppercase">Total VPCs</span>
                         <span className="text-2xl font-bold text-[var(--text-main)]">{totalVpcs}</span>
                    </Card>
                    <Card className="p-4 flex flex-col justify-center">
                         <span className="text-[var(--text-muted)] text-xs font-bold uppercase">Total EC2 Instances</span>
                         <span className="text-2xl font-bold text-[var(--text-main)]">{totalEc2}</span>
                    </Card>
                    <Card className="p-4 flex flex-col justify-center">
                         <span className="text-[var(--text-muted)] text-xs font-bold uppercase">Total Pipelines</span>
                         <span className="text-2xl font-bold text-[var(--text-main)]">{totalPipelines}</span>
                    </Card>
                </div>
            )}

            <div className="space-y-8">
                {GROUP_ORDER.map(groupName => {
                    const regions = groupedRegions[groupName];
                    if (!regions || regions.length === 0) return null;

                    const isGroupScanning = scanningGroups[groupName];

                    return (
                        <div key={groupName} className="animate-in fade-in duration-500">
                             <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-2">
                                <h3 className="text-lg font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center">
                                    {groupName}
                                    <span className="ml-2 px-2 py-0.5 bg-[var(--bg-hover)] rounded-full text-xs font-normal opacity-70">
                                        {regions.length} regions
                                    </span>
                                </h3>
                                <Button 
                                    size="sm" 
                                    variant="secondary"
                                    onClick={() => scanGroup(groupName, regions)} 
                                    disabled={isGroupScanning}
                                    icon={isGroupScanning ? Loader2 : Play}
                                    className={isGroupScanning ? "animate-pulse" : ""}
                                >
                                    {isGroupScanning ? 'Scanning...' : 'Scan Group'}
                                </Button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {regions.map((region) => {
                                    const state = scanResults[region.code] || { status: 'idle' };
                                    const isActive = state.status === 'active';
                                    const isEmpty = state.status === 'empty';
                                    const hasVpc = (state.vpcCount || 0) > 0;
                                    const hasEc2 = (state.ec2Count || 0) > 0;
                                    const hasPipe = (state.pipelineCount || 0) > 0;
                                    const isScanning = state.status === 'scanning';
                                    const isIdle = state.status === 'idle';

                                    // Render logic for count: Show 0 explicitly if scanned
                                    const displayVpc = isIdle || isScanning ? '-' : (state.vpcCount || 0);
                                    const displayEc2 = isIdle || isScanning ? '-' : (state.ec2Count || 0);
                                    const displayPipe = isIdle || isScanning ? '-' : (state.pipelineCount || 0);
                                    
                                    return (
                                        <Card 
                                            key={region.code} 
                                            className={`
                                                relative p-4 transition-all duration-300 
                                                ${isActive ? 'border-[var(--accent)] bg-[var(--accent)]/5 shadow-md' : 'opacity-100'}
                                                ${isIdle ? 'opacity-60 grayscale-[0.5]' : ''}
                                                ${isScanning ? 'border-[var(--accent)]/50' : ''}
                                            `}
                                        >
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center space-x-2">
                                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${isActive ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : isEmpty ? 'bg-[var(--text-muted)]' : 'bg-[var(--border)]'}`}></div>
                                                    <div className="min-w-0">
                                                        <h3 className={`font-bold text-sm truncate ${isActive ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>{region.name}</h3>
                                                        <code className="text-[10px] text-[var(--text-muted)] font-mono block">{region.code}</code>
                                                    </div>
                                                </div>
                                                <div className="flex-shrink-0 ml-2 h-5">
                                                    {isScanning && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />}
                                                    {state.error && (
                                                        <div title={state.error} className="group/err relative">
                                                            <AlertTriangle className="w-4 h-4 text-orange-500 cursor-help" />
                                                        </div>
                                                    )}
                                                    {isEmpty && !state.error && <CheckCircle2 className="w-4 h-4 text-[var(--text-muted)] opacity-30" />}
                                                </div>
                                            </div>

                                            <div className="space-y-2 mt-4">
                                                {/* VPC Count */}
                                                <div className={`flex items-center justify-between text-xs p-2 rounded transition-colors ${hasVpc ? 'bg-[var(--bg-card)] border border-[var(--border)] shadow-sm' : 'bg-[var(--bg-hover)]/30 text-[var(--text-muted)]'}`}>
                                                    <div className="flex items-center space-x-2">
                                                        <Cloud className={`w-3.5 h-3.5 ${hasVpc ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] opacity-50'}`} />
                                                        <span>VPCs</span>
                                                    </div>
                                                    <span className={`font-mono font-bold ${hasVpc ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>
                                                        {displayVpc}
                                                    </span>
                                                </div>

                                                {/* EC2 Count */}
                                                <div className={`flex items-center justify-between text-xs p-2 rounded transition-colors ${hasEc2 ? 'bg-[var(--bg-card)] border border-[var(--border)] shadow-sm' : 'bg-[var(--bg-hover)]/30 text-[var(--text-muted)]'}`}>
                                                    <div className="flex items-center space-x-2">
                                                        <Server className={`w-3.5 h-3.5 ${hasEc2 ? 'text-orange-500' : 'text-[var(--text-muted)] opacity-50'}`} />
                                                        <span>Instances</span>
                                                    </div>
                                                    <span className={`font-mono font-bold ${hasEc2 ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>
                                                        {displayEc2}
                                                    </span>
                                                </div>

                                                {/* CodePipeline Count */}
                                                <div className={`flex items-center justify-between text-xs p-2 rounded transition-colors ${hasPipe ? 'bg-[var(--bg-card)] border border-[var(--border)] shadow-sm' : 'bg-[var(--bg-hover)]/30 text-[var(--text-muted)]'}`}>
                                                    <div className="flex items-center space-x-2">
                                                        <Workflow className={`w-3.5 h-3.5 ${hasPipe ? 'text-purple-500' : 'text-[var(--text-muted)] opacity-50'}`} />
                                                        <span>Pipelines</span>
                                                    </div>
                                                    <span className={`font-mono font-bold ${hasPipe ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>
                                                        {displayPipe}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            {isActive && (
                                                <div className="mt-3 pt-3 border-t border-[var(--border)]/50 flex justify-end animate-in fade-in">
                                                    <button 
                                                        onClick={() => onSwitchRegion(region.code)}
                                                        className="text-[var(--accent)] hover:text-[var(--accent-hover)] text-xs font-medium flex items-center transition-colors group/btn"
                                                    >
                                                        Explore Region <ArrowRight className="w-3 h-3 ml-1 group-hover/btn:translate-x-0.5 transition-transform" />
                                                    </button>
                                                </div>
                                            )}
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
