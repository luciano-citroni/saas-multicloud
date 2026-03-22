import { Handle, Position } from '@xyflow/react';
import { Box, Cloud, Cpu, Database, FileJson, Globe, HardDrive, Layers, Lock, Network, Route, Server, Shield } from 'lucide-react';
import type { ArchitectureNodeData, GroupNodeData } from '@/components/root/assessment/types';

function getResourceVisuals(resourceType: string) {
    const type = resourceType.toLowerCase();

    if (type.includes('vpc') || type.includes('vnet')) return { icon: Cloud, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
    if (type.includes('subnet') || type.includes('network'))
        return { icon: Network, color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/20' };
    if (type.includes('ec2') || type.includes('vm') || type.includes('virtual machine'))
        return { icon: Server, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
    if (type.includes('rds') || type.includes('database') || type.includes('sql') || type.includes('cosmos'))
        return { icon: Database, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' };
    if (type.includes('security') || type.includes('waf') || type.includes('defender'))
        return { icon: Shield, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' };
    if (type.includes('load balancer') || type.includes('gateway') || type.includes('front door'))
        return { icon: Route, color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/20' };
    if (type.includes('ecs') || type.includes('container') || type.includes('aks') || type.includes('kubernetes'))
        return { icon: Box, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    if (type.includes('s3') || type.includes('bucket') || type.includes('storage') || type.includes('blob'))
        return { icon: HardDrive, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20' };
    if (type.includes('lambda') || type.includes('function'))
        return { icon: Cpu, color: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/20' };
    if (type.includes('route table') || type.includes('dns'))
        return { icon: Layers, color: 'text-teal-500', bg: 'bg-teal-500/10', border: 'border-teal-500/20' };
    if (type.includes('iam') || type.includes('role') || type.includes('identity') || type.includes('key vault'))
        return { icon: Lock, color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20' };
    if (type.includes('cloudfront') || type.includes('route53'))
        return { icon: Globe, color: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' };

    return { icon: FileJson, color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border/50' };
}

export function ArchitectureNode({ data }: { data: ArchitectureNodeData }) {
    const visuals = getResourceVisuals(data.resourceType ?? '');
    const Icon = visuals.icon;
    const normalizedStatus = data.status?.toLowerCase();
    const isRunning = normalizedStatus === 'running' || normalizedStatus === 'active';
    const isStopped = normalizedStatus === 'stopped' || normalizedStatus === 'inactive';

    return (
        <>
            <Handle
                type="target"
                position={Position.Left}
                id="left"
                className="h-2! w-2! border-background! bg-muted-foreground/60! opacity-0 transition-opacity group-hover:opacity-100"
            />
            <Handle
                type="target"
                position={Position.Top}
                id="top"
                className="h-2! w-2! border-background! bg-muted-foreground/60! opacity-0 transition-opacity group-hover:opacity-100"
            />
            <Handle
                type="source"
                position={Position.Right}
                id="right"
                className="h-2! w-2! border-background! bg-muted-foreground/60! opacity-0 transition-opacity group-hover:opacity-100"
            />
            <Handle
                type="source"
                position={Position.Bottom}
                id="bottom"
                className="h-2! w-2! border-background! bg-muted-foreground/60! opacity-0 transition-opacity group-hover:opacity-100"
            />
            <div
                className={`group flex min-h-22 w-55 items-start gap-2.5 rounded-lg border ${visuals.border} bg-card px-2.5 py-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md`}
            >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${visuals.bg}`}>
                    <Icon className={`h-5 w-5 ${visuals.color}`} strokeWidth={1.5} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <p className="line-clamp-2 break-all text-xs font-bold leading-tight text-card-foreground">
                        {data.label ?? 'Resource'}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">{data.resourceType ?? 'Unknown'}</p>
                    {data.status ? (
                        <div className="mt-0.5 flex items-center gap-1">
                            <span className="relative flex h-1.5 w-1.5">
                                {isRunning ? (
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                ) : null}
                                <span
                                    className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-emerald-500' : isStopped ? 'bg-rose-500' : 'bg-slate-400'}`}
                                ></span>
                            </span>
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{data.status}</span>
                        </div>
                    ) : null}
                </div>
            </div>
        </>
    );
}

export function ResourceGroupNode({ data }: { data: GroupNodeData }) {
    return (
        <div className="h-full w-full rounded-2xl border border-dashed border-border/70 bg-linear-to-br from-muted/25 via-background to-muted/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="inline-flex h-8 items-center rounded-br-lg rounded-tl-xl border-b border-r border-dashed border-border/70 bg-background/90 px-4 backdrop-blur-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-foreground">{data.label}</p>
            </div>
        </div>
    );
}

export const assessmentNodeTypes = {
    architectureNode: ArchitectureNode,
    resourceGroup: ResourceGroupNode,
};
