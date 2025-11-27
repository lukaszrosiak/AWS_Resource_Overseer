
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
    ArrowLeft, ZoomIn, ZoomOut, RefreshCw, 
    Server, Cloud, Box, Shield, Database, 
    FileText, Key, HardDrive, Network, Lock, Cpu 
} from 'lucide-react';
import { InventoryItem, GraphNode, GraphLink } from '../types';
import { generateMockDependencies } from '../mockData';
import { Button, Card } from './UI';

interface DependencyGraphProps {
    resource: InventoryItem;
    onBack: () => void;
    isMock: boolean;
    onNodeSelect?: (node: GraphNode) => void;
}

const SERVICE_ICONS: Record<string, any> = {
    'ec2': Server,
    'vpc': Cloud,
    's3': Box,
    'iam': Shield,
    'rds': Database,
    'lambda': Cpu,
    'cloudwatch': FileText,
    'kms': Key,
    'volume': HardDrive,
    'subnet': Network,
    'security-group': Lock,
    'default': Box
};

export const DependencyGraph: React.FC<DependencyGraphProps> = ({ resource, onBack, isMock, onNodeSelect }) => {
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [links, setLinks] = useState<GraphLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [zoom, setZoom] = useState(1);
    
    // SVG Dimensions
    const width = 800;
    const height = 600;
    const centerX = width / 2;
    const centerY = height / 2;

    useEffect(() => {
        setLoading(true);
        // Simulate fetch delay
        setTimeout(() => {
            let data;
            if (isMock) {
                data = generateMockDependencies(resource);
            } else {
                // In a real app, we would fetch from AWS Config or similar here.
                // Fallback to mock logic for now even in non-mock mode as we lack real API for relationships
                data = generateMockDependencies(resource); 
            }
            
            // Calculate positions (Simple Radial Layout)
            const count = data.nodes.length - 1; // Exclude center
            const radius = 200;
            const angleStep = (2 * Math.PI) / (count || 1);

            const positionedNodes = data.nodes.map((node, i) => {
                if (node.id === resource.resourceId) {
                    return { ...node, x: centerX, y: centerY };
                }
                // Determine index skipping the center one which is usually first
                const index = i > 0 ? i - 1 : 0; 
                const angle = index * angleStep;
                return {
                    ...node,
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                };
            });

            setNodes(positionedNodes);
            setLinks(data.links);
            setLoading(false);
        }, 800);
    }, [resource, isMock]);

    // Basic Dragging Logic
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const isDragging = useRef(false);

    const handleMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDraggingId(id);
        isDragging.current = false;
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!draggingId || !svgRef.current) return;
        
        // Mark as dragging if movement occurs
        isDragging.current = true;

        const CTM = svgRef.current.getScreenCTM();
        if (!CTM) return;

        const x = (e.clientX - CTM.e) / CTM.a;
        const y = (e.clientY - CTM.f) / CTM.d;

        setNodes(prev => prev.map(n => 
            n.id === draggingId ? { ...n, x: x / zoom, y: y / zoom } : n
        ));
    };

    const handleMouseUp = () => {
        setDraggingId(null);
        // We do NOT reset isDragging here immediately because the onClick needs to check it.
        // It's reset on next MouseDown.
    };

    const handleNodeClick = (e: React.MouseEvent, node: GraphNode) => {
        e.stopPropagation();
        // If it was a drag operation, do not trigger select
        if (!isDragging.current && onNodeSelect && node.id !== resource.resourceId) {
            onNodeSelect(node);
        }
    };

    return (
        <div className="min-h-screen pb-12 theme-transition">
            <div className="bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <button onClick={onBack} className="flex items-center text-[var(--text-muted)] hover:text-[var(--text-main)] mb-4 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Inventory
                    </button>
                    <div className="flex items-center justify-between">
                         <div>
                            <h1 className="text-xl font-bold text-[var(--text-main)] flex items-center">
                                <Network className="w-6 h-6 mr-2 text-[var(--accent)]" />
                                Resource Dependencies
                            </h1>
                            <p className="text-sm text-[var(--text-muted)] mt-1">
                                Visualizing relationships for <span className="font-mono text-[var(--accent)]">{resource.resourceId}</span>
                            </p>
                         </div>
                         <div className="flex items-center gap-2">
                             <Button size="sm" variant="secondary" icon={ZoomOut} onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} />
                             <span className="text-xs font-mono text-[var(--text-muted)] w-12 text-center">{Math.round(zoom * 100)}%</span>
                             <Button size="sm" variant="secondary" icon={ZoomIn} onClick={() => setZoom(z => Math.min(2, z + 0.1))} />
                             <div className="w-px h-6 bg-[var(--border)] mx-2"></div>
                             <Button size="sm" icon={RefreshCw} onClick={() => setLoading(true)}>Reload</Button>
                         </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 py-8">
                <Card className="h-[600px] overflow-hidden flex items-center justify-center relative bg-[var(--bg-main)]">
                    {loading ? (
                        <div className="flex flex-col items-center animate-pulse">
                            <RefreshCw className="w-10 h-10 text-[var(--accent)] animate-spin mb-4" />
                            <p className="text-[var(--text-muted)]">Discovering relationships...</p>
                        </div>
                    ) : (
                        <svg 
                            ref={svgRef}
                            width="100%" 
                            height="100%" 
                            viewBox={`0 0 ${width} ${height}`}
                            className="cursor-move"
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            <g transform={`scale(${zoom})`} style={{ transformOrigin: 'center' }}>
                                {/* Links */}
                                {links.map((link, i) => {
                                    const sourceNode = nodes.find(n => n.id === link.source);
                                    const targetNode = nodes.find(n => n.id === link.target);
                                    if (!sourceNode || !targetNode || !sourceNode.x || !sourceNode.y || !targetNode.x || !targetNode.y) return null;

                                    return (
                                        <g key={i}>
                                            <line 
                                                x1={sourceNode.x} 
                                                y1={sourceNode.y} 
                                                x2={targetNode.x} 
                                                y2={targetNode.y} 
                                                stroke="var(--border)" 
                                                strokeWidth="2" 
                                            />
                                            <text 
                                                x={(sourceNode.x + targetNode.x) / 2} 
                                                y={(sourceNode.y + targetNode.y) / 2} 
                                                textAnchor="middle" 
                                                fill="var(--text-muted)" 
                                                fontSize="10"
                                                dy="-5"
                                                className="select-none bg-[var(--bg-card)]"
                                            >
                                                {link.relationship}
                                            </text>
                                        </g>
                                    );
                                })}

                                {/* Nodes */}
                                {nodes.map((node) => {
                                    const isCenter = node.id === resource.resourceId;
                                    const Icon = SERVICE_ICONS[node.type] || SERVICE_ICONS[node.service] || SERVICE_ICONS['default'];
                                    const r = isCenter ? 35 : 25;
                                    const isClickable = !isCenter; // Only dependencies are clickable to navigate

                                    return (
                                        <g 
                                            key={node.id} 
                                            transform={`translate(${node.x}, ${node.y})`}
                                            onMouseDown={(e) => handleMouseDown(e, node.id)}
                                            onClick={(e) => handleNodeClick(e, node)}
                                            style={{ cursor: isClickable ? 'pointer' : 'default' }}
                                        >
                                            <circle 
                                                r={r} 
                                                fill={isCenter ? 'var(--accent)' : 'var(--bg-card)'} 
                                                stroke={isCenter ? 'var(--accent-hover)' : 'var(--border)'}
                                                strokeWidth="2"
                                                className={`transition-all shadow-lg ${isClickable ? 'hover:stroke-[var(--accent)] hover:stroke-2' : ''}`}
                                            />
                                            <foreignObject x={-12} y={-12} width={24} height={24} style={{ pointerEvents: 'none' }}>
                                                <div className="flex items-center justify-center h-full w-full">
                                                    <Icon 
                                                        size={20} 
                                                        color={isCenter ? '#fff' : 'var(--text-main)'} 
                                                    />
                                                </div>
                                            </foreignObject>
                                            <text 
                                                y={r + 15} 
                                                textAnchor="middle" 
                                                fill="var(--text-main)" 
                                                fontSize="12" 
                                                fontWeight="bold"
                                                className="select-none pointer-events-none shadow-sm"
                                            >
                                                {node.name}
                                            </text>
                                            <text 
                                                y={r + 28} 
                                                textAnchor="middle" 
                                                fill="var(--text-muted)" 
                                                fontSize="10"
                                                className="select-none pointer-events-none"
                                            >
                                                {node.type}
                                            </text>
                                            {isClickable && (
                                                <title>Click to visualize dependencies for {node.name}</title>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        </svg>
                    )}
                    
                    <div className="absolute bottom-4 left-4 p-4 bg-[var(--bg-card)]/90 border border-[var(--border)] rounded-lg shadow-lg text-xs backdrop-blur-sm">
                        <h4 className="font-bold text-[var(--text-main)] mb-2">Legend</h4>
                        <div className="space-y-2">
                            <div className="flex items-center">
                                <span className="w-3 h-3 rounded-full bg-[var(--accent)] mr-2"></span>
                                <span className="text-[var(--text-muted)]">Selected Resource</span>
                            </div>
                            <div className="flex items-center">
                                <span className="w-3 h-3 rounded-full bg-[var(--bg-card)] border border-[var(--border)] mr-2"></span>
                                <span className="text-[var(--text-muted)]">Dependency (Click to navigate)</span>
                            </div>
                            <div className="flex items-center">
                                <div className="w-8 h-px bg-[var(--border)] mr-2"></div>
                                <span className="text-[var(--text-muted)]">Relationship</span>
                            </div>
                        </div>
                    </div>
                </Card>
            </main>
        </div>
    );
};
