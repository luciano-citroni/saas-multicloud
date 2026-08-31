import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { CloudAccount } from './cloud-account.entity';
import { Tenant } from './tenant.entity';
import { AutomationNode } from './automation-node.entity';
import { AutomationEdge } from './automation-edge.entity';
import { AutomationVersion } from './automation-version.entity';

export enum AutomationCloudProvider {
    AWS = 'AWS',
    GCP = 'GCP',
    AZURE = 'AZURE',
}

export enum AutomationWorkflowStatus {
    DRAFT = 'DRAFT',
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

@Entity('automations')
export class Automation {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Tenant;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ type: 'varchar', length: 10, name: 'cloud_provider', default: AutomationCloudProvider.AWS })
    cloudProvider!: AutomationCloudProvider;

    @Column({ type: 'varchar', length: 20, default: AutomationWorkflowStatus.DRAFT })
    status!: AutomationWorkflowStatus;

    @Column({ type: 'int', default: 0 })
    version!: number;

    @Column({ type: 'uuid', name: 'created_by', nullable: true })
    createdBy!: string | null;

    @Column({ type: 'uuid', name: 'updated_by', nullable: true })
    updatedBy!: string | null;

    @OneToMany(() => AutomationNode, (node) => node.automation)
    nodes!: AutomationNode[];

    @OneToMany(() => AutomationEdge, (edge) => edge.automation)
    edges!: AutomationEdge[];

    @OneToMany(() => AutomationVersion, (version) => version.automation)
    versions!: AutomationVersion[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
