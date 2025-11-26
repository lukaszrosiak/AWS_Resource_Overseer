
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Activity, AlertTriangle, FileJson, Edit3, Trash2, PlusCircle, XCircle, Calendar, User } from 'lucide-react';
import { CloudTrailClient, LookupEventsCommand } from "https://esm.sh/@aws-sdk/client-cloudtrail?bundle";
import { AwsCredentials, InventoryItem, CloudTrailEvent } from '../types';
import { generateMockEvents } from '../mockData';
import { Card } from './UI';

export const InvestigationView = ({ 
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
