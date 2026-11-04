import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    type Relation,
} from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

@Entity('finops_resource_change_events')
@Index(['organizationId', 'cloudAccountId', 'detectedAt'])
@Index(['cloudAccountId', 'resourceId', 'detectedAt'])
export class FinopsResourceChangeEvent {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20, name: 'cloud_provider' })
    cloudProvider!: string;

    /** ec2 | rds | azure_vm | gcp_vm */
    @Column({ type: 'varchar', length: 40, name: 'resource_type' })
    resourceType!: string;

    @Column({ type: 'varchar', length: 512, name: 'resource_id' })
    resourceId!: string;

    /** instanceType | state | vmSize | machineType | dbInstanceClass | multiAz | provisioningState | status */
    @Column({ type: 'varchar', length: 64 })
    field!: string;

    @Column({ type: 'text', name: 'previous_value' })
    previousValue!: string;

    @Column({ type: 'text', name: 'new_value' })
    newValue!: string;

    @Column({ type: 'timestamptz', name: 'detected_at' })
    detectedAt!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: Relation<CloudAccount>;
}
