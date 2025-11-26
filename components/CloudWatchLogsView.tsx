
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Terminal, RefreshCw } from 'lucide-react';
import { CloudWatchLogsClient, FilterLogEventsCommand, DescribeLogGroupsCommand } from "https://esm.sh/@aws-sdk/client-cloudwatch-logs?bundle";
import { AwsCredentials, LogEvent } from '../types';
import { generateMockLogs } from '../mockData';
import { Button } from './UI';

export const CloudWatchLogsView = ({
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
