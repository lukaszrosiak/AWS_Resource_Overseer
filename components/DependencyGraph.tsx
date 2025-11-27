
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
    ArrowLeft, ZoomIn, ZoomOut, RefreshCw, 
    Server, Cloud, Box, Shield, Database, 
    FileText, Key, HardDrive, Network, Lock, Cpu, Layers, GitBranch, Move,
    Info, Tag, Copy, ExternalLink, Check, ChevronLeft, Activity, X
} from 'lucide-react';
import { InventoryItem, GraphNode, GraphLink } from '../types';
import { generateMockDependencies } from '../mockData';
import { Button, Card } from './UI';
import { useClickOutside } from '../hooks';

interface DependencyGraphProps {
    resource: InventoryItem;
    onBack: () => void;
    isMock: boolean;
    onNodeSelect?: (node: GraphNode) => void;
    onHistoryBack?: () => void;
    canGoBack?: boolean;
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

interface MockAttributes {
    [key: string]: string | number | boolean;
}

const generateMockAttributes = (resource: InventoryItem): MockAttributes => {
    // Generate realistic looking stats based on service
    if (resource.service === 'ec2') {
        if (resource.resourceType === 'instance') {
            return {
                "Instance State": "running",
                "Instance Type": "t3.micro",
                "Public IP": `54.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
                "Private IP": `10.0.${Math.floor(Math.random()*10)}.${Math.floor(Math.random()*255)}`,
                "Availability Zone": "eu-west-1a",
                "Launch Time": "2023-10-25T08:00:00Z"
            };
        } else if (resource.resourceType === 'volume') {
             return {
                 "Size": "20 GiB",
                 "Type": "gp3",
                 "IOPS": 3000,
                 "State": "in-use",
                 "Encrypted": true
             };
        } else if (resource.resourceType === 'security-group') {
            return {
                "Group Name": resource.resourceId,
                "Description": "Allow web traffic",
                "Inbound Rules": 4,
                "Outbound Rules": 1
            };
        }
    } else if (resource.service === 'rds') {
        return {
            "Engine": "postgres",
            "Engine Version": "14.7",
            "Instance Class": "db.t3.medium",
            "Storage": "100 GiB",
            "Status": "available",
            "Multi-AZ": true
        };
    } else if (resource.service === 'vpc') {
        if (resource.resourceType === 'vpc') {
            return {
                "CIDR": "10.0.0.0/16",
                "State": "available",
                "Tenancy": "default",
                "DHCP Options": "dopt-123456"
            };
        } else if (resource.resourceType === 'subnet') {
            return {
                "CIDR": "10.0.1.0/24",
                "Available IPs": 251,
                "Availability Zone": "eu-west-1b",
                "Map Public IP": false
            };
        }
    } else if (resource.service === 's3') {
         return {
             "Region": "eu-west-1",
             "Creation Date": "2023-01-15",
             "Versioning": "Enabled",
             "Public Access": "Blocked"
         }
    } else if (resource.service === 'lambda') {
         return {
             "Runtime": "nodejs18.x",
             "Memory": "128 MB",
             "Timeout": "3s",
             "Package Size": "450 KB",
             "Last Modified": "2023-11-10"
         }
    }

    // Default generic
    return {
        "Status": "Active",
        "Region": "eu-west-1",
        "Created": "2023-09-01"
    };
};

export const DependencyGraph: React.FC<DependencyGraphProps> = ({ resource, onBack, isMock, onNodeSelect, onHistoryBack, canGoBack }) => {
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [links, setLinks] = useState<GraphLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [depth, setDepth] = useState<number>(1);
    const [copied, setCopied] = useState(false);
    const [attributes, setAttributes] = useState<MockAttributes>({});
    
    // Tag Popover State
    const [showTags, setShowTags] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    useClickOutside(popupRef, () => setShowTags(false));

    // SVG Dimensions
    const width = 1000;
    const height = 800;
    const centerX = width / 2;
    const centerY = height / 2;

    useEffect(() => {
        setLoading(true);
        // Reset pan when loading new graph
        setPan({ x: 0, y: 0 });
        setZoom(1);

        // Mock Attributes
        setAttributes(generateMockAttributes(resource));

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

    // Dragging Logic (Nodes & Pan)
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const isDraggingNode = useRef(false);
    
    // Pan Logic
    const isPanning = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent, nodeId?: string) => {
        e.preventDefault(); // Prevent text selection
        e.stopPropagation();

        if (nodeId) {
            // Start Node Drag
            setDraggingId(nodeId);
            isDraggingNode.current = false; // Will set to true on first move to distinguish click vs drag
        } else {
            // Start Canvas Pan
            isPanning.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!svgRef.current) return;

        // 1. Handle Canvas Panning
        if (isPanning.current) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        // 2. Handle Node Dragging
        if (draggingId) {
            isDraggingNode.current = true;

            const CTM = svgRef.current.getScreenCTM();
            if (!CTM) return;

            // Get mouse position in SVG coordinates
            const svgMouseX = (e.clientX - CTM.e) / CTM.a;
            const svgMouseY = (e.clientY - CTM.f) / CTM.d;

            // Adjust for Pan and Zoom to get local coordinate inside the transformed Group
            // The formula: NodePos = (SVGPos - Pan) / Zoom
            const localX = (svgMouseX - pan.x) / zoom;
            const localY = (svgMouseY - pan.y) / zoom;

            setNodes(prev => prev.map(n => 
                n.id === draggingId ? { ...n, x: localX, y: localY } : n
            ));
        }
    };

    const handleMouseUp = () => {
        setDraggingId(null);
        isPanning.current = false;
    };

    const handleNodeClick = (e: React.MouseEvent, node: GraphNode) => {
        e.stopPropagation();
        if (!isDraggingNode.current && onNodeSelect && node.id !== resource.resourceId) {
            onNodeSelect(node);
        }
    };

    const toggleDepth = () => {
        setDepth(prev => prev === 1 ? 2 : 1);
    };

    const centerGraph = () => {
        setPan({ x: 0, y: 0 });
        setZoom(1);
    };

    const handleCopyArn = () => {
        if (!resource.arn) return;
        navigator.clipboard.writeText(resource.arn);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const ResourceIcon = SERVICE_ICONS[resource.service] || SERVICE_ICONS['default'];
    const hasTags = Object.keys(resource.tags).length > 0;

    return (
        <div className="min-h-screen pb-12 theme-transition">
            <div className="bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={onBack} className="flex items-center text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Inventory
                        </button>
                        
                        {canGoBack && onHistoryBack && (
                            <button 
                                onClick={onHistoryBack} 
                                className="flex items-center px-3 py-1.5 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 rounded-lg text-xs font-bold transition-colors animate-in slide-in-from-right-4"
                            >
                                <ChevronLeft className="w-3 h-3 mr-1" /> Back to Previous
                            </button>
                        )}
                    </div>

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
                             <Button size="sm" variant="secondary" icon={Move} onClick={centerGraph} title="Reset View" />
                             <div className="w-px h-6 bg-[var(--border)] mx-1"></div>
                             <Button size="sm" icon={RefreshCw} onClick={() => { setLoading(true); setDepth(d => d); /* force re-render */ }}>Reload</Button>
                         </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full lg:h-[650px]">
                    
                    {/* Graph Area */}
                    <div className="lg:col-span-3 h-[500px] lg:h-full">
                        <Card className="h-full overflow-hidden flex items-center justify-center relative bg-[var(--bg-main)] p-0">
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
                                    className={`touch-none ${isPanning.current ? 'cursor-grabbing' : 'cursor-grab'}`}
                                    onMouseDown={(e) => handleMouseDown(e)}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                >
                                    <defs>
                                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
                                            <polygon points="0 0, 10 3.5, 0 7" fill="var(--border)" />
                                        </marker>
                                    </defs>
                                    
                                    {/* Apply Pan and Zoom to the group containing nodes/links */}
                                    <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: '0 0', transition: isDraggingNode.current || isPanning.current ? 'none' : 'transform 0.1s' }}>
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
                                                    style={{ cursor: isClickable ? 'pointer' : 'default', transition: isDraggingNode.current ? 'none' : 'transform 0.2s' }}
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
                                        <span className="text-[var(--text-muted)]">Dependency</span>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Details Panel */}
                    <div className="lg:col-span-1 h-auto lg:h-full">
                        <Card className="h-full flex flex-col p-5 bg-[var(--bg-card)]">
                            <div className="flex items-center gap-2 mb-6 border-b border-[var(--border)] pb-4">
                                <div className="p-2 bg-[var(--accent)]/10 rounded-lg">
                                    <Info className="w-5 h-5 text-[var(--accent)]" />
                                </div>
                                <h3 className="font-bold text-[var(--text-main)] text-lg">Details</h3>
                            </div>
                            
                            <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Resource ID</label>
                                    <div className="flex items-center mt-1 relative" ref={popupRef}>
                                        <ResourceIcon className="w-5 h-5 mr-2 text-[var(--text-muted)]" />
                                        
                                        <button 
                                            onClick={() => setShowTags(!showTags)}
                                            className={`font-mono text-sm font-bold break-all text-left transition-colors border-b border-dashed outline-none ${showTags ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-main)] border-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]'}`}
                                        >
                                            {resource.resourceId}
                                        </button>
                                        
                                        {/* Tag Popover */}
                                        {showTags && (
                                            <div className="absolute left-0 top-full mt-2 z-[100] w-64 animate-in fade-in slide-in-from-top-2">
                                                <div className="bg-[var(--popup-bg)] border border-[var(--border)] rounded-lg shadow-2xl p-4 text-xs">
                                                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
                                                        <div className="font-semibold text-[var(--text-main)] flex items-center">
                                                            <Tag className="w-3.5 h-3.5 mr-2 text-[var(--accent)]" /> 
                                                            Resource Tags
                                                        </div>
                                                        <button onClick={() => setShowTags(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    
                                                    {hasTags ? (
                                                        <div className="space-y-3 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                                                            {Object.entries(resource.tags).map(([k, v]) => (
                                                            <div key={k} className="flex flex-col">
                                                                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1">{k}</span>
                                                                <span className="text-[var(--text-main)] bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1.5 font-mono break-all leading-tight">
                                                                {v}
                                                                </span>
                                                            </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[var(--text-muted)] italic">No tags found.</span>
                                                    )}
                                                    <div className="absolute left-6 -top-1.5 w-3 h-3 bg-[var(--popup-bg)] border-t border-l border-[var(--border)] transform rotate-45"></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-1 text-[10px] text-[var(--text-muted)] italic">Click ID to view tags</div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Service</label>
                                        <div className="mt-1">
                                            <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 text-xs font-mono border border-blue-500/20 capitalize">
                                                {resource.service}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Type</label>
                                        <div className="mt-1">
                                            <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-500 text-xs font-mono border border-purple-500/20 capitalize">
                                                {resource.resourceType}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">ARN</label>
                                        <button 
                                            onClick={handleCopyArn} 
                                            className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                                            title="Copy ARN"
                                        >
                                            {copied ? <Check className="w-3 h-3 text-green-500"/> : <Copy className="w-3 h-3"/>}
                                        </button>
                                    </div>
                                    <div className="mt-1 p-2 bg-[var(--bg-main)] border border-[var(--border)] rounded text-[10px] font-mono text-[var(--text-muted)] break-all leading-relaxed">
                                        {resource.arn}
                                    </div>
                                </div>

                                <div className="border-t border-[var(--border)] pt-4 mt-2">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Activity className="w-4 h-4 text-[var(--accent)]" />
                                        <span className="text-xs font-bold text-[var(--text-main)]">Configuration Attributes</span>
                                    </div>
                                    
                                    <div className="space-y-3">
                                        {Object.entries(attributes).map(([key, value]) => (
                                            <div key={key} className="flex flex-col">
                                                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider mb-0.5">{key}</span>
                                                <span className="font-mono text-xs text-[var(--text-main)] border-l-2 border-[var(--accent)]/30 pl-2">
                                                    {String(value)}
                                                </span>
                                            </div>
                                        ))}
                                        {Object.keys(attributes).length === 0 && (
                                            <div className="text-center text-[var(--text-muted)] italic text-[10px] py-2">
                                                No specific attributes available.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
};
