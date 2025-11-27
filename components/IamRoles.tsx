
import React, { useState, useEffect, useMemo } from 'react';
import { UserCog, Search, Copy, Check, ShieldCheck, Calendar, Info, Filter } from 'lucide-react';
import { IAMClient, ListRolesCommand } from "https://esm.sh/@aws-sdk/client-iam?bundle";
import { AwsCredentials, IamRole } from '../types';
import { generateMockIamRoles } from '../mockData';
import { Button, Card } from './UI';

interface IamRolesProps {
    credentials: AwsCredentials;
    isMock: boolean;
}

interface Principal {
    type: 'AWS' | 'Service' | 'Federated' | 'Unknown';
    value: string;
    raw: string;
}

export const IamRoles: React.FC<IamRolesProps> = ({ credentials, isMock }) => {
    const [roles, setRoles] = useState<IamRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterTerm, setFilterTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'AWS' | 'Service' | 'Federated'>('ALL');
    const [copiedArn, setCopiedArn] = useState<string | null>(null);

    useEffect(() => {
        const fetchRoles = async () => {
            setLoading(true);
            if (isMock) {
                setTimeout(() => {
                    setRoles(generateMockIamRoles());
                    setLoading(false);
                }, 800);
                return;
            }

            try {
                const client = new IAMClient({
                    region: 'us-east-1', // IAM is global
                    credentials: {
                        accessKeyId: credentials.accessKeyId,
                        secretAccessKey: credentials.secretAccessKey,
                        sessionToken: credentials.sessionToken || undefined,
                    }
                });

                const command = new ListRolesCommand({ MaxItems: 200 });
                const response = await client.send(command);
                
                const mappedRoles: IamRole[] = (response.Roles || []).map(r => ({
                    RoleId: r.RoleId || 'unknown',
                    RoleName: r.RoleName || 'unknown',
                    Arn: r.Arn || 'unknown',
                    CreateDate: r.CreateDate ? new Date(r.CreateDate) : new Date(),
                    Description: r.Description,
                    AssumeRolePolicyDocument: r.AssumeRolePolicyDocument
                }));

                setRoles(mappedRoles);
            } catch (err) {
                console.error("IAM fetch error", err);
            } finally {
                setLoading(false);
            }
        };

        fetchRoles();
    }, [credentials, isMock]);

    const parsePrincipals = (docString: string | undefined): Principal[] => {
        if (!docString) return [];
        try {
            const decoded = decodeURIComponent(docString);
            const doc = JSON.parse(decoded);
            const statements = Array.isArray(doc.Statement) ? doc.Statement : [doc.Statement];
            const principals: Principal[] = [];

            statements.forEach((s: any) => {
                if (s.Effect === 'Allow' && s.Principal) {
                     if (s.Principal.AWS) {
                         const aws = Array.isArray(s.Principal.AWS) ? s.Principal.AWS : [s.Principal.AWS];
                         aws.forEach((a: string) => {
                             // Clean up ARN to account ID for easier reading, but keep raw
                             const clean = a.replace(/arn:aws:iam::/, '').replace(/:root/, '');
                             principals.push({ type: 'AWS', value: clean, raw: a }); 
                         });
                     }
                     if (s.Principal.Service) {
                         const svc = Array.isArray(s.Principal.Service) ? s.Principal.Service : [s.Principal.Service];
                         svc.forEach((s: string) => principals.push({ type: 'Service', value: s, raw: s }));
                     }
                     if (s.Principal.Federated) {
                         const fed = Array.isArray(s.Principal.Federated) ? s.Principal.Federated : [s.Principal.Federated];
                         fed.forEach((f: string) => principals.push({ type: 'Federated', value: f, raw: f }));
                     }
                }
            });
            return principals;
        } catch (e) {
            return [];
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedArn(text);
        setTimeout(() => setCopiedArn(null), 2000);
    };

    const processedRoles = useMemo(() => {
        return roles.map(role => ({
            ...role,
            principals: parsePrincipals(role.AssumeRolePolicyDocument)
        }));
    }, [roles]);

    const filteredRoles = processedRoles.filter(role => {
        // 1. Type Filter
        if (typeFilter !== 'ALL') {
            const hasType = role.principals.some(p => p.type === typeFilter);
            if (!hasType) return false;
        }

        // 2. Text Filter
        if (!filterTerm) return true;
        const term = filterTerm.toLowerCase();
        
        const matchesName = role.RoleName.toLowerCase().includes(term);
        const matchesArn = role.Arn.toLowerCase().includes(term);
        const matchesPrincipal = role.principals.some(p => p.value.toLowerCase().includes(term) || p.raw.toLowerCase().includes(term));

        return matchesName || matchesArn || matchesPrincipal;
    });

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
                 <h2 className="text-2xl font-bold text-[var(--text-main)] flex items-center">
                    <UserCog className="w-6 h-6 mr-2 text-[var(--accent)]" />
                    IAM Roles & Trusted Entities
                 </h2>
                 <p className="text-[var(--text-muted)] mt-1">
                    Find roles and filter by trusted entities (principals) to identify cross-account access or service roles.
                 </p>
            </div>

            <Card className="p-4 bg-[var(--bg-main)]">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input 
                            type="text" 
                            placeholder="Filter by Trusted Entity (e.g., Account ID '123456789012') or Role Name..." 
                            value={filterTerm}
                            onChange={(e) => setFilterTerm(e.target.value)}
                            className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-2.5 text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)] outline-none transition-all"
                        />
                    </div>
                    <div className="w-full md:w-48 relative">
                        <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as any)}
                            className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg pl-10 pr-8 py-2.5 text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)] outline-none appearance-none cursor-pointer"
                        >
                            <option value="ALL">All Entity Types</option>
                            <option value="AWS">AWS Account</option>
                            <option value="Service">AWS Service</option>
                            <option value="Federated">Federated (SAML/OIDC)</option>
                        </select>
                         <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none border-t-4 border-l-4 border-r-4 border-transparent border-t-[var(--text-muted)]"></div>
                    </div>
                </div>
            </Card>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1,2,3,4,5,6].map(i => (
                        <div key={i} className="h-40 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl animate-pulse"></div>
                    ))}
                </div>
            ) : filteredRoles.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-card)]/50">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No roles found matching your criteria.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredRoles.map(role => (
                        <Card key={role.RoleId} className="flex flex-col h-full hover:border-[var(--accent)] transition-all duration-200 group relative">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-[var(--text-main)] truncate max-w-[85%] text-sm" title={role.RoleName}>
                                    {role.RoleName}
                                </h3>
                                <button 
                                    onClick={() => handleCopy(role.Arn)}
                                    className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors p-1"
                                    title="Copy Role ARN"
                                >
                                    {copiedArn === role.Arn ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                            
                            <div className="text-[10px] font-mono text-[var(--text-muted)] mb-3 break-all bg-[var(--bg-hover)] p-1.5 rounded border border-[var(--border)]/50">
                                {role.Arn}
                            </div>

                            <div className="flex-1 space-y-3">
                                <div>
                                    <div className="text-[10px] uppercase font-bold text-[var(--text-muted)] mb-1.5 flex items-center">
                                        <ShieldCheck className="w-3 h-3 mr-1" /> Trusted Entities
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {role.principals.length === 0 && <span className="text-[10px] text-[var(--text-muted)] italic">None</span>}
                                        {role.principals.slice(0, 4).map((p, i) => {
                                            let badgeStyle = "bg-gray-500/10 text-gray-500 border-gray-500/20";
                                            if (p.type === 'AWS') badgeStyle = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                                            if (p.type === 'Service') badgeStyle = "bg-orange-500/10 text-orange-500 border-orange-500/20";
                                            if (p.type === 'Federated') badgeStyle = "bg-purple-500/10 text-purple-500 border-purple-500/20";
                                            
                                            return (
                                                <span 
                                                    key={i} 
                                                    className={`px-1.5 py-0.5 rounded text-[10px] border truncate max-w-full font-mono cursor-help ${badgeStyle}`}
                                                    title={`${p.type}: ${p.raw}`}
                                                >
                                                    {p.type === 'AWS' ? `Account: ${p.value.split('/').pop()}` : p.value}
                                                </span>
                                            );
                                        })}
                                        {role.principals.length > 4 && (
                                            <span className="px-1.5 py-0.5 bg-[var(--bg-hover)] text-[var(--text-muted)] rounded text-[10px] border border-[var(--border)]">
                                                +{role.principals.length - 4}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                {role.Description && (
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-[var(--text-muted)] mb-1 flex items-center">
                                            <Info className="w-3 h-3 mr-1" /> Description
                                        </div>
                                        <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-tight">
                                            {role.Description}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 pt-3 border-t border-[var(--border)]/50 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                                <div className="flex items-center opacity-80">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    {role.CreateDate.toLocaleDateString()}
                                </div>
                                <div className="font-mono opacity-50">{role.RoleId}</div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
