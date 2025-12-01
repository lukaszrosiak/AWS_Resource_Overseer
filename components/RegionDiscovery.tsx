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

interface ScanResult {
    code: string;
    vpcCount: number;
    ec2Count: number;
    pipelineCount: number;
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
                // Use explicit typing to ensure results are correctly inferred
                const promises = batch.map(async (region) => {
                    const result = await scanRegionResources(region.code);
                    return { code: region.code, ...result } as ScanResult;
                });

                const results = await Promise.all(promises);

                // Update state incrementally
                setScanResults(prev => {
                    const next = { ...prev };
                    results.forEach((r) => {
                        next[r.code] = {
                            status: (r.vpcCount > 0 || r.ec2Count > 0 || r.pipelineCount > 0) ? 'active' : 'empty',
                            vpcCount: r.vpcCount,
                            ec2Count: r.ec2Count,
                            pipelineCount: r.pipelineCount,
                            error: r.error
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
                    <Card className="p-4 flex flex-col items-center justify-center text-center">
                        <span className="text-3xl font-bold text-[var(--accent)]">{regionsWithResources}</span>
                        <span className="text-xs text-[var(--text-muted)] uppercase mt-1">Active Regions</span>
                    </Card>
                    <Card className="p-4 flex flex-col items-center justify-center text-center">
                        <span className="text-3xl font-bold text-[var(--text-main)]">{totalVpcs}</span>
                        <span className="text-xs text-[var(--text-muted)] uppercase mt-1">Total VPCs</span>
                    </Card>
                    <Card className="p-4 flex flex-col items-center justify-center text-center">
                        <span className="text-3xl font-bold text-[var(--text-main)]">{totalEc2}</span>
                        <span className="text-xs text-[var(--text-muted)] uppercase mt-1">Total EC2</span>
                    </Card>
                    <Card className="p-4 flex flex-col items-center justify-center text-center">
                         <span className="text-3xl font-bold text-[var(--text-main)]">{totalPipelines}</span>
                         <span className="text-xs text-[var(--text-muted)] uppercase mt-1">Pipelines</span>
                    </Card>
                </div>
            )}

            {GROUP_ORDER.map(groupName => (
                <div key={groupName} className="space-y-4">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                        <h3 className="text-lg font-bold text-[var(--text-main)]">{groupName} Regions</h3>
                        {scanningGroups[groupName] ? (
                            <span className="text-xs text-[var(--accent)] flex items-center animate-pulse">
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scanning...
                            </span>
                        ) : (
                            <Button size="sm" variant="secondary" icon={Play} onClick={() => scanGroup(groupName, groupedRegions[groupName])}>
                                Scan Group
                            </Button>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {groupedRegions[groupName].map(region => {
                            const state = scanResults[region.code] || { status: 'idle' };
                            return (
                                <Card 
                                    key={region.code} 
                                    className={`relative transition-all duration-300 ${state.status === 'active' ? 'border-[var(--accent)] bg-[var(--accent)]/5' : ''} ${state.status === 'error' ? 'border-red-500/50 bg-red-500/5' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center space-x-2">
                                            {state.status === 'active' && <CheckCircle2 className="w-4 h-4 text-[var(--accent)]" />}
                                            {state.status === 'error' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                                            <span className={`font-mono text-sm ${state.status === 'active' ? 'font-bold text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>
                                                {region.code}
                                            </span>
                                        </div>
                                        {state.status === 'active' && (
                                             <button 
                                                onClick={() => onSwitchRegion(region.code)}
                                                className="text-[10px] bg-[var(--accent)] text-white px-2 py-0.5 rounded hover:bg-[var(--accent-hover)] transition-colors flex items-center"
                                             >
                                                 Switch <ArrowRight className="w-3 h-3 ml-1" />
                                             </button>
                                        )}
                                    </div>
                                    <div className="text-xs text-[var(--text-muted)] truncate mb-3" title={region.name}>{region.name}</div>
                                    
                                    {state.status === 'scanning' ? (
                                        <div className="py-2 flex justify-center">
                                            <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
                                        </div>
                                    ) : state.status === 'active' ? (
                                        <div className="grid grid-cols-3 gap-2 mt-2">
                                            <div className="bg-[var(--bg-card)] p-1.5 rounded border border-[var(--border)] text-center">
                                                <div className="text-[10px] uppercase text-[var(--text-muted)]">VPC</div>
                                                <div className="font-bold text-[var(--text-main)]">{state.vpcCount}</div>
                                            </div>
                                            <div className="bg-[var(--bg-card)] p-1.5 rounded border border-[var(--border)] text-center">
                                                <div className="text-[10px] uppercase text-[var(--text-muted)]">EC2</div>
                                                <div className="font-bold text-[var(--text-main)]">{state.ec2Count}</div>
                                            </div>
                                            <div className="bg-[var(--bg-card)] p-1.5 rounded border border-[var(--border)] text-center">
                                                <div className="text-[10px] uppercase text-[var(--text-muted)]">Pipe</div>
                                                <div className="font-bold text-[var(--text-main)]">{state.pipelineCount}</div>
                                            </div>
                                        </div>
                                    ) : state.status === 'error' ? (
                                        <div className="text-xs text-red-400 mt-2">
                                            Scan failed: {state.error}
                                        </div>
                                    ) : state.status === 'empty' ? (
                                        <div className="text-xs text-[var(--text-muted)] italic mt-2 text-center opacity-50">
                                            No resources found
                                        </div>
                                    ) : (
                                        <div className="h-8"></div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};