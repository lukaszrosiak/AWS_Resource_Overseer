
import React, { useState, useEffect, useMemo } from 'react';
import { HardDrive, Search, Trash2, RefreshCw, Calendar, Clock, AlertTriangle, CheckCircle2, X, Loader2, Database, Eraser } from 'lucide-react';
import { S3Client, ListBucketsCommand, DeleteBucketCommand, ListObjectVersionsCommand, DeleteObjectsCommand } from "https://esm.sh/@aws-sdk/client-s3?bundle";
import { AwsCredentials, S3BucketSummary } from '../types';
import { generateMockBuckets } from '../mockData';
import { Button, Card } from './UI';

interface S3BucketViewProps {
    credentials: AwsCredentials;
    isMock: boolean;
}

export const S3BucketView: React.FC<S3BucketViewProps> = ({ credentials, isMock }) => {
    const [buckets, setBuckets] = useState<S3BucketSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedBucketNames, setSelectedBucketNames] = useState<Set<string>>(new Set());
    
    // Deletion State
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
    const [emptyBeforeDelete, setEmptyBeforeDelete] = useState(false);
    const [progressMessage, setProgressMessage] = useState<string>('');

    // Filtering
    const [searchTerm, setSearchTerm] = useState('');

    const fetchBuckets = async () => {
        setLoading(true);
        setError(null);
        setSelectedBucketNames(new Set());

        if (isMock) {
            setTimeout(() => {
                setBuckets(generateMockBuckets());
                setLoading(false);
            }, 800);
            return;
        }

        try {
            const client = new S3Client({
                region: credentials.region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken || undefined,
                }
            });

            const command = new ListBucketsCommand({});
            const response = await client.send(command);
            
            const mappedBuckets: S3BucketSummary[] = (response.Buckets || []).map(b => ({
                Name: b.Name || 'unknown',
                CreationDate: b.CreationDate ? new Date(b.CreationDate) : new Date(),
            })).sort((a,b) => b.CreationDate.getTime() - a.CreationDate.getTime());

            setBuckets(mappedBuckets);

        } catch (err: any) {
            console.error("S3 Error", err);
            setError(err.message || "Failed to list buckets.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBuckets();
    }, [credentials, isMock]);

    const toggleSelection = (name: string) => {
        const newSet = new Set(selectedBucketNames);
        if (newSet.has(name)) {
            newSet.delete(name);
        } else {
            newSet.add(name);
        }
        setSelectedBucketNames(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedBucketNames.size === filteredBuckets.length && filteredBuckets.length > 0) {
            setSelectedBucketNames(new Set());
        } else {
            const newSet = new Set<string>();
            filteredBuckets.forEach(b => newSet.add(b.Name));
            setSelectedBucketNames(newSet);
        }
    };

    const emptyBucket = async (client: S3Client, bucketName: string) => {
        setProgressMessage(`Listing objects in ${bucketName}...`);
        
        // Loop until all versions and markers are deleted
        let continuationToken: string | undefined = undefined;
        let keyMarker: string | undefined = undefined;
        let versionIdMarker: string | undefined = undefined;

        do {
            const command = new ListObjectVersionsCommand({
                Bucket: bucketName,
                KeyMarker: keyMarker,
                VersionIdMarker: versionIdMarker,
                MaxKeys: 1000 // Max batch size for delete
            });

            const response = await client.send(command);
            
            const objectsToDelete = [
                ...(response.Versions || []).map(v => ({ Key: v.Key, VersionId: v.VersionId })),
                ...(response.DeleteMarkers || []).map(d => ({ Key: d.Key, VersionId: d.VersionId }))
            ];

            if (objectsToDelete.length > 0) {
                setProgressMessage(`Deleting ${objectsToDelete.length} objects from ${bucketName}...`);
                const deleteCommand = new DeleteObjectsCommand({
                    Bucket: bucketName,
                    Delete: {
                        Objects: objectsToDelete,
                        Quiet: true
                    }
                });
                await client.send(deleteCommand);
            }

            keyMarker = response.NextKeyMarker;
            versionIdMarker = response.NextVersionIdMarker;
            // Continue if IsTruncated is true
        } while (keyMarker || versionIdMarker); // Simplified check, strictly should check IsTruncated
    };

    const performDelete = async () => {
        setIsDeleting(true);
        setDeleteSuccess(null);
        setError(null);
        setProgressMessage('Initiating deletion...');

        if (isMock) {
            const delay = emptyBeforeDelete ? 2500 : 1000;
            if (emptyBeforeDelete) setProgressMessage('Simulating empty bucket operation...');
            
            setTimeout(() => {
                setBuckets(prev => prev.filter(b => !selectedBucketNames.has(b.Name)));
                setSelectedBucketNames(new Set());
                setIsDeleting(false);
                setShowDeleteConfirm(false);
                setDeleteSuccess(`Successfully deleted ${selectedBucketNames.size} buckets (Mock).`);
                setProgressMessage('');
                setTimeout(() => setDeleteSuccess(null), 3000);
            }, delay);
            return;
        }

        const client = new S3Client({
            region: credentials.region,
            credentials: {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken || undefined,
            }
        });

        try {
            for (const bucketName of selectedBucketNames) {
                if (emptyBeforeDelete) {
                    await emptyBucket(client, bucketName);
                }
                
                setProgressMessage(`Deleting bucket ${bucketName}...`);
                await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
            }
            
            setDeleteSuccess(`Successfully deleted ${selectedBucketNames.size} buckets.`);
            setSelectedBucketNames(new Set());
            setShowDeleteConfirm(false);
            
            setTimeout(fetchBuckets, 1500);
            setTimeout(() => setDeleteSuccess(null), 5000);
            
        } catch (err: any) {
            console.error("Delete Error", err);
            // If error is BucketNotEmpty, give specific advice
            if (err.name === 'BucketNotEmpty') {
                setError(`Failed to delete bucket: The bucket is not empty. Select "Empty buckets" option to force delete.`);
            } else {
                setError(`Failed to delete buckets: ${err.message}`);
            }
            setShowDeleteConfirm(false);
        } finally {
            setIsDeleting(false);
            setProgressMessage('');
        }
    };

    const filteredBuckets = useMemo(() => {
        return buckets.filter(b => b.Name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [buckets, searchTerm]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            
            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 max-w-md w-full shadow-2xl m-4">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600">
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                                <h3 className="text-lg font-bold text-[var(--text-main)]">Delete Buckets?</h3>
                            </div>
                            <button onClick={() => setShowDeleteConfirm(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="text-[var(--text-muted)] mb-4 text-sm leading-relaxed space-y-3">
                            <p>
                                Are you sure you want to delete <span className="font-bold text-[var(--text-main)]">{selectedBucketNames.size}</span> buckets? 
                                This action cannot be undone.
                            </p>
                            
                            <div className="bg-[var(--bg-hover)] p-3 rounded-lg border border-[var(--border)]">
                                <label className="flex items-start gap-2 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={emptyBeforeDelete} 
                                        onChange={(e) => setEmptyBeforeDelete(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                                    />
                                    <span className="text-sm">
                                        <span className="font-bold text-[var(--text-main)]">Empty buckets first</span>
                                        <span className="block text-xs mt-0.5 opacity-80">
                                            If checked, all objects (including versions) inside the buckets will be permanently deleted before deleting the bucket itself.
                                        </span>
                                    </span>
                                </label>
                            </div>
                        </div>

                        {isDeleting && (
                            <div className="mb-4 text-xs text-[var(--accent)] flex items-center">
                                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                {progressMessage}
                            </div>
                        )}
                        
                        <div className="flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                                Cancel
                            </Button>
                            <Button variant="danger" onClick={performDelete} disabled={isDeleting} icon={isDeleting ? Loader2 : Trash2}>
                                {isDeleting ? 'Processing...' : (emptyBeforeDelete ? 'Empty & Delete' : 'Delete')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-[var(--text-main)] flex items-center">
                        <HardDrive className="w-6 h-6 mr-2 text-[var(--accent)]" />
                        S3 Buckets
                    </h2>
                    <p className="text-[var(--text-muted)] mt-1">
                        Manage S3 buckets. List, empty, and delete storage resources.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                     {selectedBucketNames.size > 0 && (
                         <Button 
                            variant="danger" 
                            onClick={() => { setEmptyBeforeDelete(false); setShowDeleteConfirm(true); }}
                            icon={Trash2}
                            className="animate-in fade-in slide-in-from-right-2"
                         >
                             Delete Selected ({selectedBucketNames.size})
                         </Button>
                     )}
                     <Button variant="secondary" icon={RefreshCw} onClick={fetchBuckets} disabled={loading || isDeleting}>
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
                            placeholder="Filter buckets by name..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-sm text-[var(--text-main)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-all"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <Database className="w-4 h-4" />
                        <span>Showing {filteredBuckets.length} buckets</span>
                    </div>
                </div>
            </Card>

            {loading ? (
                <div className="space-y-3">
                    {[1,2,3,4,5].map(i => (
                        <div key={i} className="h-14 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg animate-pulse"></div>
                    ))}
                </div>
            ) : error ? (
                <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center justify-center gap-3">
                    <AlertTriangle className="w-6 h-6" />
                    <span>{error}</span>
                </div>
            ) : filteredBuckets.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-card)]/50">
                    <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No buckets found.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center justify-between px-4 py-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)] mb-2">
                        <div className="flex items-center gap-4">
                            <input 
                                type="checkbox" 
                                checked={selectedBucketNames.size === filteredBuckets.length && filteredBuckets.length > 0}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                            />
                            <span>Name</span>
                        </div>
                        <div className="flex items-center gap-8">
                            <div className="hidden md:block w-32 text-right">Creation Date</div>
                            <div className="w-24 text-right">Actions</div>
                        </div>
                    </div>

                    {filteredBuckets.map(bucket => {
                        const isSelected = selectedBucketNames.has(bucket.Name);

                        return (
                            <div 
                                key={bucket.Name}
                                className={`group bg-[var(--bg-card)] border rounded-lg p-4 transition-all hover:shadow-md flex items-center gap-4 ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] hover:border-[var(--text-muted)]'}`}
                            >
                                <input 
                                    type="checkbox" 
                                    checked={isSelected}
                                    onChange={() => toggleSelection(bucket.Name)}
                                    className="w-4 h-4 rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer shrink-0"
                                />
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Database className="w-4 h-4 text-[var(--text-muted)]" />
                                        <h3 className="font-bold text-[var(--text-main)] truncate text-sm" title={bucket.Name}>
                                            {bucket.Name}
                                        </h3>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end shrink-0 text-xs text-[var(--text-muted)] w-32 hidden md:flex">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        <span>{bucket.CreationDate.toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-70">
                                        <Clock className="w-3 h-3" />
                                        <span>{bucket.CreationDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                                
                                <div className="w-24 flex justify-end">
                                    <button
                                        onClick={() => {
                                            setSelectedBucketNames(new Set([bucket.Name]));
                                            setEmptyBeforeDelete(true);
                                            setShowDeleteConfirm(true);
                                        }}
                                        className="p-1.5 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        title="Empty & Delete"
                                    >
                                        <Eraser className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedBucketNames(new Set([bucket.Name]));
                                            setEmptyBeforeDelete(false);
                                            setShowDeleteConfirm(true);
                                        }}
                                        className="p-1.5 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        title="Delete Bucket"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};