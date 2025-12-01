
import React, { useState, useEffect, useMemo } from 'react';
import { Layers, Search, Trash2, RefreshCw, Filter, Calendar, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react';
import { CloudFormationClient, ListStacksCommand, DeleteStackCommand } from "https://esm.sh/@aws-sdk/client-cloudformation?bundle";
import { AwsCredentials, CloudFormationStackSummary } from '../types';
import { generateMockStacks } from '../mockData';
import { Button, Card } from './UI';

interface CloudFormationViewProps {
    credentials: AwsCredentials;
    isMock: boolean;
}

export const CloudFormationView: React.FC<CloudFormationViewProps> = ({ credentials, isMock }) => {
    const [stacks, setStacks] = useState<CloudFormationStackSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedStackIds, setSelectedStackIds] = useState<Set<string>>(new Set());
    
    // Deletion State
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
    
    // Filtering & Sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<'name' | 'time'>('time');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const fetchStacks = async () => {
        setLoading(true);
        setError(null);
        // Do not clear selection on refresh to allow persisting selections across polls if needed,
        // but for now let's keep it simple and clear to avoid ghost selections
        setSelectedStackIds(new Set());

        if (isMock) {
            setTimeout(() => {
                setStacks(generateMockStacks());
                setLoading(false);
            }, 800);
            return;
        }

        try {
            const client = new CloudFormationClient({
                region: credentials.region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken || undefined,
                }
            });

            const command = new ListStacksCommand({
                // Filter out DELETE_COMPLETE to keep list clean
                StackStatusFilter: [
                    'CREATE_IN_PROGRESS', 'CREATE_FAILED', 'CREATE_COMPLETE',
                    'ROLLBACK_IN_PROGRESS', 'ROLLBACK_FAILED', 'ROLLBACK_COMPLETE',
                    'DELETE_IN_PROGRESS', 'DELETE_FAILED',
                    'UPDATE_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_IN_PROGRESS', 'UPDATE_ROLLBACK_FAILED', 'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS', 'UPDATE_ROLLBACK_COMPLETE',
                    'REVIEW_IN_PROGRESS', 'IMPORT_IN_PROGRESS', 'IMPORT_COMPLETE', 'IMPORT_ROLLBACK_IN_PROGRESS', 'IMPORT_ROLLBACK_FAILED', 'IMPORT_ROLLBACK_COMPLETE'
                ]
            });
            const response = await client.send(command);
            
            const mappedStacks: CloudFormationStackSummary[] = (response.StackSummaries || []).map(s => ({
                StackName: s.StackName || 'unknown',
                StackId: s.StackId || 'unknown',
                StackStatus: s.StackStatus || 'UNKNOWN',
                CreationTime: s.CreationTime ? new Date(s.CreationTime) : new Date(),
                TemplateDescription: s.TemplateDescription
            }));

            setStacks(mappedStacks);
        } catch (err: any) {
            console.error("CloudFormation Error", err);
            setError(err.message || "Failed to list stacks.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStacks();
    }, [credentials, isMock]);

    const handleSort = (key: 'name' | 'time') => {
        if (sortKey === key) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir(key === 'time' ? 'desc' : 'asc'); // Default newest for time, A-Z for name
        }
    };

    const toggleSelection = (stackId: string) => {
        const newSet = new Set(selectedStackIds);
        if (newSet.has(stackId)) {
            newSet.delete(stackId);
        } else {
            newSet.add(stackId);
        }
        setSelectedStackIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedStackIds.size === filteredStacks.length && filteredStacks.length > 0) {
            setSelectedStackIds(new Set());
        } else {
            const newSet = new Set<string>();
            filteredStacks.forEach(s => newSet.add(s.StackId || s.StackName));
            setSelectedStackIds(newSet);
        }
    };

    const confirmDelete = async () => {
        setDeleting(true);
        setDeleteSuccess(null);
        setError(null);

        if (isMock) {
            setTimeout(() => {
                // Filter out stacks where either ID or Name matches the selection (robustness for mock data)
                setStacks(prev => prev.filter(s => !selectedStackIds.has(s.StackId) && !selectedStackIds.has(s.StackName)));
                setSelectedStackIds(new Set());
                setDeleting(false);
                setShowDeleteConfirm(false);
                setDeleteSuccess("Successfully deleted selected stacks (Mock).");
                setTimeout(() => setDeleteSuccess(null), 3000);
            }, 1500);
            return;
        }

        try {
            const client = new CloudFormationClient({
                region: credentials.region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken || undefined,
                }
            });

            // Execute deletions in parallel
            const promises = Array.from(selectedStackIds).map(async (id) => {
                // Find stack name if ID is an ARN, though DeleteStack accepts name or ID
                // Prefer ID if available for precision
                const command = new DeleteStackCommand({ StackName: id });
                await client.send(command);
            });

            await Promise.all(promises);
            
            setDeleteSuccess(`Deletion initiated for ${selectedStackIds.size} stacks.`);
            setSelectedStackIds(new Set());
            setShowDeleteConfirm(false);
            
            // Refresh list after brief delay to allow AWS to update status to DELETE_IN_PROGRESS
            setTimeout(fetchStacks, 2000);
            setTimeout(() => setDeleteSuccess(null), 5000);
            
        } catch (err: any) {
            console.error("Delete Error", err);
            setError(`Failed to delete some stacks: ${err.message}`);
        } finally {
            setDeleting(false);
        }
    };

    const filteredStacks = useMemo(() => {
        return stacks.filter(s => s.StackName.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [stacks, searchTerm]);

    const sortedStacks = useMemo(() => {
        return [...filteredStacks].sort((a, b) => {
            if (sortKey === 'name') {
                 return sortDir === 'asc' 
                    ? a.StackName.localeCompare(b.StackName) 
                    : b.StackName.localeCompare(a.StackName);
            } else {
                 return sortDir === 'asc' 
                    ? a.CreationTime.getTime() - b.CreationTime.getTime() 
                    : b.CreationTime.getTime() - a.CreationTime.getTime();
            }
        });
    }, [filteredStacks, sortKey, sortDir]);

    const getStatusColor = (status: string) => {
        if (status.includes('COMPLETE') && !status.includes('ROLLBACK') && !status.includes('DELETE')) return 'text-green-500 bg-green-500/10 border-green-500/20';
        if (status.includes('FAILED') || status.includes('ROLLBACK')) return 'text-red-500 bg-red-500/10 border-red-500/20';
        if (status.includes('IN_PROGRESS')) return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
        return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            
            {/* Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 max-w-md w-full shadow-2xl m-4">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600">
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                                <h3 className="text-lg font-bold text-[var(--text-main)]">Delete Stacks?</h3>
                            </div>
                            <button onClick={() => setShowDeleteConfirm(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <p className="text-[var(--text-muted)] mb-6 leading-relaxed">
                            Are you sure you want to delete <span className="font-bold text-[var(--text-main)]">{selectedStackIds.size}</span> stacks? 
                            This will terminate all resources associated with them. This action cannot be undone.
                        </p>
                        
                        <div className="flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                                Cancel
                            </Button>
                            <Button variant="danger" onClick={confirmDelete} disabled={deleting} icon={deleting ? Loader2 : Trash2}>
                                {deleting ? 'Deleting...' : 'Confirm Delete'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-[var(--text-main)] flex items-center">
                        <Layers className="w-6 h-6 mr-2 text-[var(--accent)]" />
                        CloudFormation Stacks
                    </h2>
                    <p className="text-[var(--text-muted)] mt-1">
                        Manage infrastructure stacks. Filter, sort, and bulk delete resources.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                     {selectedStackIds.size > 0 && (
                         <Button 
                            variant="danger" 
                            onClick={() => setShowDeleteConfirm(true)}
                            icon={Trash2}
                            className="animate-in fade-in slide-in-from-right-2"
                         >
                             Delete Selected ({selectedStackIds.size})
                         </Button>
                     )}
                     <Button variant="secondary" icon={RefreshCw} onClick={fetchStacks} disabled={loading || deleting}>
                         Refresh
                     </Button>
                </div>
            </div>

            {deleteSuccess && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-600 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-2">
                    <CheckCircle2 className="w-5 h-5" />
                    {deleteSuccess}
                </div>
            )}

            <Card className="p-4 bg-[var(--bg-main)] sticky top-[72px] z-10 shadow-sm border-[var(--border)]">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                    <div className="relative flex-1 min-w-[250px]">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input 
                            type="text" 
                            placeholder="Filter stacks by name..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-sm text-[var(--text-main)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-all"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-muted)] uppercase mr-1">Sort By:</span>
                        <button 
                            onClick={() => handleSort('time')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium border flex items-center gap-1 transition-colors ${sortKey === 'time' ? 'bg-[var(--bg-card)] border-[var(--accent)] text-[var(--accent)]' : 'bg-transparent border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                        >
                            <Clock className="w-3 h-3" /> Time
                            {sortKey === 'time' && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1"/> : <ArrowDown className="w-3 h-3 ml-1"/>)}
                        </button>
                        <button 
                            onClick={() => handleSort('name')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium border flex items-center gap-1 transition-colors ${sortKey === 'name' ? 'bg-[var(--bg-card)] border-[var(--accent)] text-[var(--accent)]' : 'bg-transparent border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                        >
                            <ArrowUpDown className="w-3 h-3" /> Name
                            {sortKey === 'name' && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1"/> : <ArrowDown className="w-3 h-3 ml-1"/>)}
                        </button>
                    </div>
                </div>
            </Card>

            {loading ? (
                <div className="space-y-3">
                    {[1,2,3,4,5].map(i => (
                        <div key={i} className="h-16 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg animate-pulse"></div>
                    ))}
                </div>
            ) : error ? (
                <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center justify-center gap-3">
                    <AlertTriangle className="w-6 h-6" />
                    <span>{error}</span>
                </div>
            ) : sortedStacks.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-card)]/50">
                    <Layers className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No stacks found.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center justify-between px-4 py-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)] mb-2">
                        <div className="flex items-center gap-4">
                            <input 
                                type="checkbox" 
                                checked={selectedStackIds.size === filteredStacks.length && filteredStacks.length > 0}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                            />
                            <span>{filteredStacks.length} Stacks</span>
                        </div>
                        <div className="hidden md:block">Creation Time</div>
                    </div>

                    {sortedStacks.map(stack => {
                        const isSelected = selectedStackIds.has(stack.StackId || stack.StackName);
                        const statusColor = getStatusColor(stack.StackStatus);
                        const isDeleting = stack.StackStatus === 'DELETE_IN_PROGRESS';

                        return (
                            <div 
                                key={stack.StackId || stack.StackName}
                                className={`group bg-[var(--bg-card)] border rounded-lg p-4 transition-all hover:shadow-md flex items-center gap-4 ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] hover:border-[var(--text-muted)]'} ${isDeleting ? 'opacity-70' : ''}`}
                            >
                                <input 
                                    type="checkbox" 
                                    checked={isSelected}
                                    onChange={() => toggleSelection(stack.StackId || stack.StackName)}
                                    className="w-4 h-4 rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer shrink-0"
                                />
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-col md:flex-row md:items-center gap-2 mb-1">
                                        <h3 className="font-bold text-[var(--text-main)] truncate text-sm" title={stack.StackName}>
                                            {stack.StackName}
                                        </h3>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono border uppercase w-fit ${statusColor}`}>
                                            {stack.StackStatus}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] truncate">{stack.TemplateDescription || 'No description provided.'}</p>
                                </div>

                                <div className="flex flex-col items-end shrink-0 text-xs text-[var(--text-muted)]">
                                    <div className="flex items-center gap-1" title={stack.CreationTime.toLocaleString()}>
                                        <Calendar className="w-3 h-3" />
                                        <span>{stack.CreationTime.toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-70">
                                        <Clock className="w-3 h-3" />
                                        <span>{stack.CreationTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
