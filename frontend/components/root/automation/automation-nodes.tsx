'use client';

import { Handle, Position } from '@xyflow/react';
import { Server, HardDrive, Database, Zap, Cloud, Container, Network, Shield, Box, Globe, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

type NodeData = {
    label: string;
    resourceType: string;
    configured: boolean;
    config: Record<string, unknown>;
};

const RESOURCE_META: Record<string, { icon: typeof Server; color: string; label: string }> = {
    ec2: { icon: Server, color: 'bg-chart-4 text-primary-foreground', label: 'EC2' },
    s3: { icon: HardDrive, color: 'bg-chart-2 text-primary-foreground', label: 'S3' },
    rds: { icon: Database, color: 'bg-chart-1 text-primary-foreground', label: 'RDS' },
    lambda: { icon: Zap, color: 'bg-chart-5 text-primary-foreground', label: 'Lambda' },
    AWS_S3_BUCKET_CREATE: { icon: HardDrive, color: 'bg-chart-2 text-primary-foreground', label: 'S3' },
    AWS_CLOUDFRONT_DISTRIBUTION_CREATE: { icon: Cloud, color: 'bg-chart-4 text-primary-foreground', label: 'CloudFront' },
    AWS_ECS_CLUSTER_CREATE: { icon: Container, color: 'bg-chart-1 text-primary-foreground', label: 'ECS' },
    AWS_ECS_TASK_DEFINITION_CREATE: { icon: Container, color: 'bg-chart-1/90 text-primary-foreground', label: 'Task Def' },
    AWS_ECR_REPOSITORY_CREATE: { icon: Box, color: 'bg-chart-2/90 text-primary-foreground', label: 'ECR' },
    AWS_LOAD_BALANCER_CREATE: { icon: Network, color: 'bg-chart-3 text-primary-foreground', label: 'ALB' },
    AWS_LAMBDA_FUNCTION_CREATE: { icon: Zap, color: 'bg-chart-5 text-primary-foreground', label: 'Lambda' },
    AWS_IAM_ROLE_CREATE: { icon: Shield, color: 'bg-destructive text-destructive-foreground', label: 'IAM Role' },
    AWS_SECURITY_GROUP_CREATE: { icon: Shield, color: 'bg-destructive/90 text-destructive-foreground', label: 'SG' },
    AWS_VPC_CREATE: { icon: Network, color: 'bg-primary text-primary-foreground', label: 'VPC' },
    AWS_SUBNET_CREATE: { icon: Network, color: 'bg-primary/90 text-primary-foreground', label: 'Subnet' },
    AWS_ROUTE_TABLE_CREATE: { icon: Network, color: 'bg-secondary text-secondary-foreground', label: 'Route' },
    AWS_NAT_GATEWAY_CREATE: { icon: Globe, color: 'bg-chart-3/90 text-primary-foreground', label: 'NAT' },
    AWS_RDS_INSTANCE_CREATE: { icon: Database, color: 'bg-chart-1 text-primary-foreground', label: 'RDS' },
    AWS_EC2_INSTANCE_CREATE: { icon: Server, color: 'bg-chart-4 text-primary-foreground', label: 'EC2' },
    AWS_AMPLIFY_APP_CREATE: { icon: Globe, color: 'bg-accent text-accent-foreground', label: 'Amplify' },
    AWS_API_GATEWAY_CREATE: { icon: Network, color: 'bg-chart-5/90 text-primary-foreground', label: 'API GW' },
    AWS_CLOUDFORMATION_STACK: { icon: Layers, color: 'bg-primary text-primary-foreground', label: 'Stack' },
    AWS_EXISTING_RESOURCE: { icon: Database, color: 'bg-muted text-muted-foreground', label: 'Existente' },
    AWS_DATA_INPUT: { icon: Box, color: 'bg-secondary text-secondary-foreground', label: 'Dados' },
    AWS_CALLER_IDENTITY: { icon: Shield, color: 'bg-muted text-muted-foreground', label: 'Identidade' },
    AWS_REFRESH_INVENTORY: { icon: Layers, color: 'bg-muted text-muted-foreground', label: 'Inventário' },
};

function AutomationResourceNode({ data, selected }: { data: NodeData; selected?: boolean }) {
    const meta = RESOURCE_META[data.resourceType] ?? {
        icon: Cloud,
        color: 'bg-muted text-muted-foreground',
        label: data.resourceType,
    };
    const Icon = meta.icon;

    return (
        <div
            className={cn(
                'group min-w-[160px] rounded-xl border-2 bg-card text-card-foreground shadow-sm transition-all',
                selected ? 'border-primary shadow-md' : 'border-border hover:border-primary/50',
                !data.configured && 'border-dashed border-amber-500/70 dark:border-amber-400/60',
            )}
        >
            <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground" />

            <div className="flex items-center gap-2 px-3 py-2.5">
                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', meta.color)}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{data.label || meta.label}</p>
                    <p className="text-[10px] text-muted-foreground">{meta.label}</p>
                </div>
            </div>

            {!data.configured && (
                <div className="border-t border-dashed border-amber-500/40 bg-amber-50 px-3 py-1 text-[10px] text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-300">
                    Clique para configurar
                </div>
            )}

            <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground" />
        </div>
    );
}

export const automationNodeTypes = {
    automationResource: AutomationResourceNode,
};

export type { NodeData as AutomationNodeData };
