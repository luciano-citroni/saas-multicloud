import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    type Relation
} from 'typeorm';
import { AutomationExecution, PricingModel } from './automation-execution.entity';

export enum ProvisionedResourceStatus {
    PENDING = 'PENDING',
    PROVISIONED = 'PROVISIONED',
    FAILED = 'FAILED',
    ROLLED_BACK = 'ROLLED_BACK',
}

@Entity('provisioned_resource')
export class ProvisionedResource {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'execution_id' })
    executionId: string;

    @ManyToOne(() => AutomationExecution, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'execution_id' })
    execution: Relation<AutomationExecution>;

    @Column({ name: 'resource_type' })
    resourceType: string;

    @Column({ type: 'varchar', name: 'aws_resource_id', nullable: true })
    awsResourceId: string | null;

    @Column({ type: 'varchar', length: 1024, nullable: true })
    arn: string | null;

    @Column({ type: 'varchar', name: 'stack_id', length: 512, nullable: true })
    stackId: string | null;

    @Column({ type: 'varchar', name: 'inventory_sync_status', length: 20, default: 'NOT_APPLICABLE' })
    inventorySyncStatus: string;

    @Column()
    region: string;

    @Column({ type: 'jsonb' })
    config: Record<string, unknown>;

    @Column({ type: 'decimal', precision: 10, scale: 4, name: 'estimated_cost', default: 0 })
    estimatedCost: number;

    @Column({ type: 'varchar', name: 'pricing_model' })
    pricingModel: PricingModel;

    @Column({ type: 'varchar', default: ProvisionedResourceStatus.PENDING })
    status: ProvisionedResourceStatus;

    @Column({ type: 'text', name: 'error_message', nullable: true })
    errorMessage: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
