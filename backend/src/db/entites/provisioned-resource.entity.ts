import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AutomationExecution, PricingModel } from './automation-execution.entity';

export enum ProvisionedResourceStatus {
    PENDING = 'PENDING',
    PROVISIONED = 'PROVISIONED',
    FAILED = 'FAILED',
}

@Entity('provisioned_resource')
export class ProvisionedResource {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'execution_id' })
    executionId: string;

    @ManyToOne(() => AutomationExecution, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'execution_id' })
    execution: AutomationExecution;

    @Column({ name: 'resource_type' })
    resourceType: string;

    @Column({ type: 'varchar', name: 'aws_resource_id', nullable: true })
    awsResourceId: string | null;

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
