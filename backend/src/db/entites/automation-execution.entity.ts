import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from './organization.entity';
import { CloudAccount } from './cloud-account.entity';

export enum AutomationStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

export enum PricingModel {
    ON_DEMAND = 'ON_DEMAND',
    RESERVED = 'RESERVED',
    SAVINGS = 'SAVINGS',
}

@Entity('automation_execution')
export class AutomationExecution {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'organization_id' })
    organizationId: string;

    @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization: Organization;

    @Column({ name: 'cloud_account_id' })
    cloudAccountId: string;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount: CloudAccount;

    @Column({ type: 'varchar', name: 'pricing_model' })
    pricingModel: PricingModel;

    @Column({ type: 'decimal', precision: 10, scale: 4, name: 'total_estimated_cost', default: 0 })
    totalEstimatedCost: number;

    @Column({ type: 'varchar', default: AutomationStatus.PENDING })
    status: AutomationStatus;

    @Column({ type: 'jsonb', name: 'flow_definition' })
    flowDefinition: Record<string, unknown>;

    @Column({ type: 'text', name: 'error_message', nullable: true })
    errorMessage: string | null;

    @Column({ type: 'int', name: 'duration_ms', nullable: true })
    durationMs: number | null;

    @OneToMany('ProvisionedResource', 'execution')
    resources: unknown[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
