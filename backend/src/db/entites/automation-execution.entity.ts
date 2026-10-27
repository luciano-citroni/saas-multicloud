import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation
} from 'typeorm';
import { Organization } from './organization.entity';
import { CloudAccount } from './cloud-account.entity';
import { Automation } from './automation.entity';
import { AutomationExecutionNode } from './automation-execution-node.entity';

export enum AutomationStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
}

export enum PricingModel {
    ON_DEMAND = 'ON_DEMAND',
    RESERVED = 'RESERVED',
    SAVINGS = 'SAVINGS',
}

@Entity('automation_execution')
export class AutomationExecution {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'organization_id' })
    organizationId!: string;

    @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Relation<Organization>;

    @Column({ name: 'cloud_account_id' })
    cloudAccountId!: string;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: Relation<CloudAccount>;

    @Column({ type: 'uuid', name: 'automation_id', nullable: true })
    automationId!: string | null;

    @ManyToOne(() => Automation, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'automation_id' })
    automation!: Relation<Automation | null>;

    @Column({ type: 'int', name: 'automation_version', nullable: true })
    automationVersion!: number | null;

    @Column({ type: 'uuid', name: 'triggered_by', nullable: true })
    triggeredBy!: string | null;

    @Column({ type: 'varchar', name: 'pricing_model', nullable: true })
    pricingModel!: PricingModel | null;

    @Column({ type: 'decimal', precision: 10, scale: 4, name: 'total_estimated_cost', default: 0 })
    totalEstimatedCost!: number;

    @Column({ type: 'varchar', default: AutomationStatus.PENDING })
    status!: AutomationStatus;

    @Column({ type: 'jsonb', name: 'flow_definition', default: {} })
    flowDefinition!: Record<string, unknown>;

    @Column({ type: 'text', name: 'error_message', nullable: true })
    errorMessage!: string | null;

    @Column({ type: 'int', name: 'duration_ms', nullable: true })
    durationMs!: number | null;

    @Column({ type: 'timestamp', name: 'started_at', nullable: true })
    startedAt!: Date | null;

    @Column({ type: 'timestamp', name: 'finished_at', nullable: true })
    finishedAt!: Date | null;

    @OneToMany('ProvisionedResource', 'execution')
    resources!: Relation<unknown[]>;

    @OneToMany(() => AutomationExecutionNode, (node) => node.execution)
    executionNodes!: Relation<AutomationExecutionNode[]>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
