
import React, { useState, useEffect } from 'react';
import { Terminal, Power, Wifi, WifiOff, ExternalLink, RefreshCw } from 'lucide-react';
import { EC2Client, DescribeInstancesCommand } from "https://esm.sh/@aws-sdk/client-ec2?bundle";
import { SSMClient, DescribeInstanceInformationCommand } from "https://esm.sh/@aws-sdk/client-ssm?bundle";
import { AwsCredentials, Ec2Instance } from '../types';
import { generateMockInstances } from '../mockData';
import { Button, Card } from './UI';

interface SSMConnectProps {
    credentials: AwsCredentials;
    isMock: boolean;
}

export const SSMConnect: React.FC<SSMConnectProps> = ({ credentials, isMock }) => {
    const [instances, setInstances] = useState<Ec2Instance[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchInstances = async () => {
        setLoading(true);
        if (isMock) {
            setTimeout(() => {
                setInstances(generateMockInstances());
                setLoading(false);
            }, 800);
            return;
        }

        try {
            const ec2Client = new EC2Client({
                region: credentials.region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken || undefined,
                }
            });

            const ssmClient = new SSMClient({
                region: credentials.region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken || undefined,
                }
            });

            // 1. Get EC2 Instances
            const ec2Cmd = new DescribeInstancesCommand({});
            const ec2Res = await ec2Client.send(ec2Cmd);
            
            // 2. Get SSM Status
            const ssmCmd = new DescribeInstanceInformationCommand({});
            const ssmRes = await ssmClient.send(ssmCmd);
            const ssmMap = new Map<string, string>();
            (ssmRes.InstanceInformationList || []).forEach(info => {
                if(info.InstanceId) ssmMap.set(info.InstanceId, info.PingStatus || 'Unknown');
            });

            // 3. Merge Data
            const merged: Ec2Instance[] = [];
            (ec2Res.Reservations || []).forEach(res => {
                (res.Instances || []).forEach(inst => {
                    const nameTag = inst.Tags?.find(t => t.Key === 'Name')?.Value || 'Unnamed';
                    merged.push({
                        InstanceId: inst.InstanceId || 'unknown',
                        Name: nameTag,
                        State: inst.State?.Name || 'unknown',
                        PrivateIpAddress: inst.PrivateIpAddress || 'N/A',
                        PublicIpAddress: inst.PublicIpAddress,
                        Platform: inst.PlatformDetails || inst.Platform || 'Linux', // Simple fallback
                        PingStatus: (ssmMap.get(inst.InstanceId || '') as any) || 'Unknown',
                        LaunchTime: inst.LaunchTime ? new Date(inst.LaunchTime) : new Date()
                    });
                });
            });

            setInstances(merged);
        } catch (err) {
            console.error("Failed to fetch EC2/SSM data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInstances();
    }, [credentials, isMock]);

    const openConsoleSession = (instanceId: string) => {
        if (isMock) {
            alert(`In a live environment, this would open AWS Systems Manager Session Manager for instance ${instanceId}.`);
            return;
        }
        const url = `https://${credentials.region}.console.aws.amazon.com/systems-manager/session-manager/${instanceId}`;
        window.open(url, '_blank');
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-[var(--text-main)] flex items-center">
                        <Terminal className="w-6 h-6 mr-2 text-[var(--accent)]" />
                        Session Manager
                    </h2>
                    <p className="text-[var(--text-muted)] mt-1">
                        Manage EC2 instances via AWS Systems Manager. Connect directly through the AWS Console.
                    </p>
                </div>
                <Button variant="secondary" icon={RefreshCw} onClick={fetchInstances} disabled={loading}>Refresh</Button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                     {[1,2,3].map(i => <div key={i} className="h-48 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl animate-pulse"></div>)}
                </div>
            ) : instances.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-card)]/50 text-[var(--text-muted)]">
                    No EC2 instances found in this region.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {instances.map(inst => {
                        const isRunning = inst.State === 'running';
                        const isOnline = inst.PingStatus === 'Online';
                        const canConnect = isRunning && isOnline;

                        return (
                            <Card key={inst.InstanceId} className="relative overflow-hidden group transition-all duration-300">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center space-x-2">
                                        <div className={`p-2 rounded-lg ${isRunning ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                                            <Power className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-[var(--text-main)] truncate max-w-[150px]" title={inst.Name}>{inst.Name}</h3>
                                            <div className="text-[10px] font-mono text-[var(--text-muted)]">{inst.InstanceId}</div>
                                        </div>
                                    </div>
                                    <div className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${isRunning ? 'border-green-500/30 text-green-500' : 'border-gray-500/30 text-gray-500'}`}>
                                        {inst.State}
                                    </div>
                                </div>
                                
                                <div className="space-y-2 mb-4 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-muted)]">Platform</span>
                                        <span className="text-[var(--text-main)] truncate max-w-[140px]" title={inst.Platform}>{inst.Platform}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-muted)]">Private IP</span>
                                        <span className="text-[var(--text-main)] font-mono">{inst.PrivateIpAddress}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[var(--text-muted)]">SSM Agent</span>
                                        <div className="flex items-center">
                                            {isOnline ? <Wifi className="w-3 h-3 text-green-500 mr-1"/> : <WifiOff className="w-3 h-3 text-red-500 mr-1"/>}
                                            <span className={isOnline ? 'text-green-500' : 'text-red-500'}>{inst.PingStatus}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-2 pt-3 border-t border-[var(--border)]">
                                     <Button 
                                        className="w-full" 
                                        variant={canConnect ? 'primary' : 'secondary'}
                                        disabled={!canConnect}
                                        icon={ExternalLink}
                                        onClick={() => openConsoleSession(inst.InstanceId)}
                                     >
                                         {canConnect ? 'Open Session (AWS Console)' : (isRunning ? 'Agent Offline' : 'Instance Stopped')}
                                     </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
