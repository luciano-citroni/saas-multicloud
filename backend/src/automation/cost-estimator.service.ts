import { Injectable } from '@nestjs/common';
import type { FlowNodeDto } from './dto';

// Monthly on-demand prices (USD) — approximate, us-east-1 reference
const EC2_PRICES: Record<string, number> = {
    't3.nano': 3.80,
    't3.micro': 7.59,
    't3.small': 15.18,
    't3.medium': 30.37,
    't3.large': 60.74,
    't3.xlarge': 121.47,
    't3.2xlarge': 242.94,
    'm5.large': 87.60,
    'm5.xlarge': 175.19,
    'm5.2xlarge': 350.38,
    'm5.4xlarge': 700.76,
    'c5.large': 77.40,
    'c5.xlarge': 154.80,
    'c5.2xlarge': 309.60,
    'r5.large': 126.00,
    'r5.xlarge': 252.00,
    'r5.2xlarge': 504.00,
};

const RDS_PRICES: Record<string, number> = {
    'db.t3.micro': 15.33,
    'db.t3.small': 30.67,
    'db.t3.medium': 61.34,
    'db.t3.large': 122.67,
    'db.m5.large': 138.67,
    'db.m5.xlarge': 277.34,
    'db.m5.2xlarge': 554.67,
    'db.r5.large': 182.40,
    'db.r5.xlarge': 364.80,
};

const S3_PRICE_PER_GB = 0.023;

const LAMBDA_BASE_PRICE = 0.20; // per 1M requests
const LAMBDA_COMPUTE_PRICE_PER_GB_SECOND = 0.0000166667;
const LAMBDA_MONTHLY_INVOCATIONS = 1_000_000;

export interface ResourceCostEstimate {
    nodeId: string;
    type: string;
    label: string;
    region: string;
    onDemand: number;
    reserved: number;
    savings: number;
}

@Injectable()
export class CostEstimatorService {
    estimateFlow(nodes: FlowNodeDto[]): ResourceCostEstimate[] {
        return nodes.map((node) => this.estimateNode(node));
    }

    estimateNode(node: FlowNodeDto): ResourceCostEstimate {
        const onDemand = this.getOnDemandCost(node);
        const reserved = parseFloat((onDemand * 0.7).toFixed(4));
        const savings = parseFloat((onDemand * 0.6).toFixed(4));

        return {
            nodeId: node.id,
            type: node.type,
            label: node.label ?? this.defaultLabel(node),
            region: this.getRegion(node),
            onDemand,
            reserved,
            savings,
        };
    }

    applyPricingModel(onDemand: number, model: 'ON_DEMAND' | 'RESERVED' | 'SAVINGS'): number {
        if (model === 'RESERVED') return parseFloat((onDemand * 0.7).toFixed(4));
        if (model === 'SAVINGS') return parseFloat((onDemand * 0.6).toFixed(4));
        return onDemand;
    }

    private getOnDemandCost(node: FlowNodeDto): number {
        const config = node.config as Record<string, unknown>;

        switch (node.type) {
            case 'ec2': {
                const instanceType = String(config.instanceType ?? 't3.micro');
                return EC2_PRICES[instanceType] ?? EC2_PRICES['t3.micro'];
            }
            case 's3': {
                const storageGb = typeof config.storageGb === 'number' ? config.storageGb : 10;
                const base = parseFloat((storageGb * S3_PRICE_PER_GB).toFixed(4));
                return Math.max(base, 0.50);
            }
            case 'rds': {
                const dbClass = String(config.dbInstanceClass ?? 'db.t3.micro');
                const storage = typeof config.allocatedStorage === 'number' ? config.allocatedStorage : 20;
                const instanceCost = RDS_PRICES[dbClass] ?? RDS_PRICES['db.t3.micro'];
                const storageCost = parseFloat((storage * 0.115).toFixed(4));
                const multiAzMultiplier = config.multiAz ? 2 : 1;
                return parseFloat(((instanceCost * multiAzMultiplier) + storageCost).toFixed(4));
            }
            case 'lambda': {
                const memoryMb = typeof config.memorySize === 'number' ? config.memorySize : 128;
                const timeoutSec = typeof config.timeout === 'number' ? config.timeout : 30;
                const gbSeconds = (memoryMb / 1024) * timeoutSec * LAMBDA_MONTHLY_INVOCATIONS;
                const computeCost = gbSeconds * LAMBDA_COMPUTE_PRICE_PER_GB_SECOND;
                const requestCost = LAMBDA_BASE_PRICE;
                return parseFloat((computeCost + requestCost).toFixed(4));
            }
            default:
                return 0;
        }
    }

    private getRegion(node: FlowNodeDto): string {
        const config = node.config as Record<string, unknown>;
        return String(config.region ?? 'us-east-1');
    }

    private defaultLabel(node: FlowNodeDto): string {
        const config = node.config as Record<string, unknown>;
        switch (node.type) {
            case 'ec2':
                return `EC2 ${String(config.instanceType ?? 't3.micro')}`;
            case 's3':
                return `S3 ${String(config.bucketName ?? 'bucket')}`;
            case 'rds':
                return `RDS ${String(config.engine ?? 'postgres')} ${String(config.dbInstanceClass ?? 'db.t3.micro')}`;
            case 'lambda':
                return `Lambda ${String(config.functionName ?? 'function')}`;
            default:
                return node.type;
        }
    }
}
