
import React, { useState, useEffect } from 'react';
import { Cpu, Clock, Search, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { AwsCredentials, BedrockRuntime } from '../types';
import { generateMockBedrockRuntimes } from '../mockData';
import { Button, Card } from './UI';

interface BedrockRuntimeRowProps {
    runtime: BedrockRuntime;
    credentials: AwsCredentials;
    isMock: boolean;
    onViewLogs: (runtimeId: string) => void;
}

export const BedrockRuntimeRow: React.FC<BedrockRuntimeRowProps> = ({
    runtime,
    credentials,
    isMock,
    onViewLogs
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

export const BedrockRuntimeList = ({
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
