'use client';

import { Handle, Position } from '@xyflow/react';
import { Server, HardDrive, Database, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

type NodeData = {
    label: string;
    resourceType: 'ec2' | 's3' | 'rds' | 'lambda';
    configured: boolean;
    config: Record<string, unknown>;
};

const RESOURCE_META = {
    ec2: { icon: Server, color: 'bg-orange-500', label: 'EC2' },
    s3: { icon: HardDrive, color: 'bg-green-500', label: 'S3' },
    rds: { icon: Database, color: 'bg-blue-500', label: 'RDS' },
    lambda: { icon: Zap, color: 'bg-purple-500', label: 'Lambda' },
} as const;

function AutomationResourceNode({ data, selected }: { data: NodeData; selected?: boolean }) {
    const meta = RESOURCE_META[data.resourceType];
    const Icon = meta.icon;

    return (
        <div
            className={cn(
                'group min-w-[160px] rounded-xl border-2 bg-background shadow-sm transition-all',
                selected ? 'border-primary shadow-md' : 'border-border hover:border-primary/50',
                !data.configured && 'border-dashed border-amber-400',
            )}
        >
            <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-background !bg-muted-foreground" />

            <div className="flex items-center gap-2 px-3 py-2.5">
                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white', meta.color)}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{data.label || meta.label}</p>
                    <p className="text-[10px] text-muted-foreground">{meta.label}</p>
                </div>
            </div>

            {!data.configured && (
                <div className="border-t border-dashed border-amber-300 bg-amber-50 px-3 py-1 text-[10px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                    Clique para configurar
                </div>
            )}

            <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-background !bg-muted-foreground" />
        </div>
    );
}

export const automationNodeTypes = {
    automationResource: AutomationResourceNode,
};

export type { NodeData as AutomationNodeData };
