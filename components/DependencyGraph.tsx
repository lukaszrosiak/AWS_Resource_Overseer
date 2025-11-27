
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
    ArrowLeft, ZoomIn, ZoomOut, RefreshCw, 
    Server, Cloud, Box, Shield, Database, 
    FileText, Key, HardDrive, Network, Lock, Cpu, Layers, GitBranch
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
    const [depth, setDepth] = useState<number>(1);
    
    // SVG Dimensions
    const width = 1000;
    const height = 800;
    const centerX = width / 2;
    const centerY = height / 2;

    useEffect(() => {
        setLoading(true);
        // Simulate fetch delay
        setTimeout(() => {
            let data;
            if (isMock) {
                data = generateMockDependencies(resource, depth);
            } else {
                // In a real app, we would fetch from AWS Config or similar here.
                // Fallback to mock logic for now
                data = generateMockDependencies(resource, depth); 
            }
            
            // --- Hierarchical Radial Layout ---
            
            // 1. Identify Root
            const rootNode = data.nodes.find(n => n.id === resource.resourceId);
            if (!rootNode) return; // Should not happen
            
            const layoutNodes: GraphNode[] = [];
            const processedIds = new Set<string>();

            // Place Root
            layoutNodes.push({ ...rootNode, x: centerX, y: centerY });
            processedIds.add(rootNode.id);

            // 2. Identify Level 1 (Direct neighbors of Root)
            const level1Ids = new Set<string>();
            const l1Links = data.links.filter(l => l.source === rootNode.id || l.target === rootNode.id);
            l1Links.forEach(l => {
                const other = l.source === rootNode.id ? l.target : l.source;
                level1Ids.add(other);
            });

            // Position Level 1 Nodes
            const l1Nodes = data.nodes.filter(n => level1Ids.has(n.id) && !processedIds.has(n.id));
            const r1 = 200;
            const angleStep1 = (2 * Math.PI) / (l1Nodes.length || 1);
            
            l1Nodes.forEach((node, i) => {
                const angle = i * angleStep1;
                layoutNodes.push({
                    ...node,
                    x: centerX + r1 * Math.cos(angle),
                    y: centerY + r1 * Math.sin(angle)
                });
                processedIds.add(node.id);
            });

            // 3. Identify Level 2 (Neighbors of Level 1)
            // We group them by their Level 1 parent to keep them close visually
            const r2 = 380; // Outer radius
            
            // For each L1 node, find its children that haven't been placed
            l1Nodes.forEach((l1Node, i) => {
                // Find placed L1 node coordinates to calculate angle
                const placedL1 = layoutNodes.find(n => n.id === l1Node.id);
                if (!placedL1) return;

                // Find links connecting this L1 node to unplaced nodes
                const childLinks = data.links.filter(l => 
                    (l.source === l1Node.id && !processedIds.has(l.target)) || 
                    (l.target === l1Node.id && !processedIds.has(l.source))
                );
                
                const childIds = childLinks.map(l => l.source === l1Node.id ? l.target : l.source);
                const childNodes = data.nodes.filter(n => childIds.includes(n.id) && !processedIds.has(n.id));

                if (childNodes.length === 0) return;

                // Spread children in a small arc around the L1 parent's angle
                const parentAngle = i * angleStep1;
                // Arc width depends on number of children, but limit to avoid overlap
                const arcWidth = Math.min(Math.PI / 4, childNodes.length * (Math.PI / 12)); 
                const startAngle = parentAngle - arcWidth / 2;
                const step = childNodes.length > 1 ? arcWidth / (childNodes.length - 1) : 0;

                childNodes.forEach((child, j) => {
                    const childAngle = startAngle + (j * step);
                    // Add some jitter to radius to avoid perfect circles looking artificial
                    const rJitter = (j % 2 === 0 ? 20 : -20); 
                    layoutNodes.push({
                        ...child,
                        x: centerX + (r2 + rJitter) * Math.cos(childAngle),
                        y: centerY + (r2 + rJitter) * Math.sin(childAngle)
                    });
                    processedIds.add(child.id);
                });
            });

            // 4. Any remaining nodes (orphans or complex loops) - dump them far out
            const remaining = data.nodes.filter(n => !processedIds.has(n.id));
            remaining.forEach((node, i) => {
                const angle = (i / remaining.length) * 2 * Math.PI;
                layoutNodes.push({
                    ...node,
                    x: centerX + 500 * Math.cos(angle),
                    y: centerY + 500 * Math.sin(angle)
                });
            });

            setNodes(layoutNodes);
            setLinks(data.links);
            setLoading(false);
        }, 800);
    }, [resource, isMock, depth]);

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
    };

    const handleNodeClick = (e: React.MouseEvent, node: GraphNode) => {
        e.stopPropagation();
        if (!isDragging.current && onNodeSelect && node.id !== resource.resourceId) {
            onNodeSelect(node);
        }
    };

    const toggleDepth = () => {
        setDepth(prev => prev === 1 ? 2 : 1);
    };

    return (
        <div className="min-h-screen pb-12 theme-transition">
            <div className="bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <button onClick={onBack} className="flex items-center text-[var(--text-muted)] hover:text-[var(--text-main)] mb-4 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Inventory
                    </button>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                         <div>
                            <h1 className="text-xl font-bold text-[var(--text-main)] flex items-center">
                                <Network className="w-6 h-6 mr-2 text-[var(--accent)]" />
                                Resource Dependencies
                            </h1>
                            <p className="text-sm text-[var(--text-muted)] mt-1">
                                Visualizing relationships for <span className="font-mono text-[var(--accent)]">{resource.resourceId}</span>
                            </p>
                         </div>
                         <div className="flex items-center gap-2 bg-[var(--bg-main)] p-1 rounded-lg border border-[var(--border)]">
                             <Button 
                                size="sm" 
                                variant={depth === 2 ? "primary" : "ghost"} 
                                icon={GitBranch} 
                                onClick={toggleDepth}
                                title={depth === 1 ? "Show extended dependencies" : "Show direct dependencies only"}
                             >
                                 {depth === 1 ? 'Direct Only' : 'Extended Graph'}
                             </Button>
                             <div className="w-px h-6 bg-[var(--border)] mx-1"></div>
                             <Button size="sm" variant="secondary" icon={ZoomOut} onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} />
                             <span className="text-xs font-mono text-[var(--text-muted)] w-12 text-center">{Math.round(zoom * 100)}%</span>
                             <Button size="sm" variant="secondary" icon={ZoomIn} onClick={() => setZoom(z => Math.min(2, z + 0.1))} />
                             <div className="w-px h-6 bg-[var(--border)] mx-1"></div>
                             <Button size="sm" icon={RefreshCw} onClick={() => { setLoading(true); setDepth(d => d); /* force re-render */ }}>Reload</Button>
                         </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 py-8">
                <Card className="h-[650px] overflow-hidden flex items-center justify-center relative bg-[var(--bg-main)]">
                    {loading ? (
                        <div className="flex flex-col items-center animate-pulse">
                            <RefreshCw className="w-10 h-10 text-[var(--accent)] animate-spin mb-4" />
                            <p className="text-[var(--text-muted)]">
                                {depth === 1 ? 'Discovering direct relationships...' : 'Analyzing extended dependency chain...'}
                            </p>
                        </div>
                    ) : (
                        <svg 
                            ref={svgRef}
                            width="100%" 
                            height="100%" 
                            viewBox={`0 0 ${width} ${height}`}
                            className="cursor-move touch-none"
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            <defs>
                                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="var(--border)" />
                                </marker>
                            </defs>
                            <g transform={`scale(${zoom})`} style={{ transformOrigin: 'center', transition: 'transform 0.1s' }}>
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
                                                strokeWidth="1.5" 
                                                opacity="0.6"
                                            />
                                            {/* Label for relationship */}
                                            {zoom > 0.6 && (
                                                <text 
                                                    x={(sourceNode.x + targetNode.x) / 2} 
                                                    y={(sourceNode.y + targetNode.y) / 2} 
                                                    textAnchor="middle" 
                                                    fill="var(--text-muted)" 
                                                    fontSize="9"
                                                    dy="-5"
                                                    className="select-none bg-[var(--bg-card)]/80 px-1"
                                                >
                                                    {link.relationship}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}

                                {/* Nodes */}
                                {nodes.map((node) => {
                                    const isCenter = node.id === resource.resourceId;
                                    const Icon = SERVICE_ICONS[node.type] || SERVICE_ICONS[node.service] || SERVICE_ICONS['default'];
                                    const r = isCenter ? 35 : (node.x && Math.abs(node.x - centerX) < 250 ? 25 : 20); // Scale down outer nodes
                                    const isClickable = !isCenter; 

                                    return (
                                        <g 
                                            key={node.id} 
                                            transform={`translate(${node.x}, ${node.y})`}
                                            onMouseDown={(e) => handleMouseDown(e, node.id)}
                                            onClick={(e) => handleNodeClick(e, node)}
                                            style={{ cursor: isClickable ? 'pointer' : 'default', transition: 'transform 0.2s' }}
                                        >
                                            <circle 
                                                r={r} 
                                                fill={isCenter ? 'var(--accent)' : 'var(--bg-card)'} 
                                                stroke={isCenter ? 'var(--accent-hover)' : 'var(--border)'}
                                                strokeWidth={isCenter ? 4 : 2}
                                                className={`transition-all shadow-lg ${isClickable ? 'hover:stroke-[var(--accent)]' : ''}`}
                                            />
                                            <foreignObject x={-12} y={-12} width={24} height={24} style={{ pointerEvents: 'none' }}>
                                                <div className="flex items-center justify-center h-full w-full">
                                                    <Icon 
                                                        size={20} 
                                                        color={isCenter ? '#fff' : 'var(--text-main)'} 
                                                        strokeWidth={1.5}
                                                    />
                                                </div>
                                            </foreignObject>
                                            
                                            {/* Node Label */}
                                            {zoom > 0.4 && (
                                                <>
                                                    <text 
                                                        y={r + 15} 
                                                        textAnchor="middle" 
                                                        fill="var(--text-main)" 
                                                        fontSize="10" 
                                                        fontWeight="bold"
                                                        className="select-none pointer-events-none"
                                                    >
                                                        {node.name.length > 15 ? node.name.substring(0, 12) + '...' : node.name}
                                                    </text>
                                                    <text 
                                                        y={r + 25} 
                                                        textAnchor="middle" 
                                                        fill="var(--text-muted)" 
                                                        fontSize="8"
                                                        className="select-none pointer-events-none uppercase tracking-wide"
                                                    >
                                                        {node.type}
                                                    </text>
                                                </>
                                            )}
                                            
                                            {isClickable && (
                                                <title>Click to visualize dependencies for {node.name}</title>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        </svg>
                    )}
                    
                    <div className="absolute bottom-4 left-4 p-4 bg-[var(--bg-card)]/90 border border-[var(--border)] rounded-lg shadow-lg text-xs backdrop-blur-sm pointer-events-none select-none">
                        <h4 className="font-bold text-[var(--text-main)] mb-2 flex items-center"><Layers className="w-3 h-3 mr-1"/> Legend</h4>
                        <div className="space-y-2">
                            <div className="flex items-center">
                                <span className="w-3 h-3 rounded-full bg-[var(--accent)] mr-2 shadow-sm"></span>
                                <span className="text-[var(--text-muted)]">Selected Resource</span>
                            </div>
                            <div className="flex items-center">
                                <span className="w-3 h-3 rounded-full bg-[var(--bg-card)] border border-[var(--border)] mr-2"></span>
                                <span className="text-[var(--text-muted)]">Dependency Level 1</span>
                            </div>
                            {depth > 1 && (
                                <div className="flex items-center">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] mr-2 opacity-70"></span>
                                    <span className="text-[var(--text-muted)]">Dependency Level 2</span>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            </main>
        </div>
    );
};
