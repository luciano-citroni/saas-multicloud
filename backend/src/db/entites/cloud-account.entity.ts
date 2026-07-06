import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { Organization } from './organization.entity';
import { Tenant } from './tenant.entity';

export enum CloudProvider {
    AWS = 'aws',
    AZURE = 'azure',
    GCP = 'gcp',
}

@Entity('cloud_accounts')
export class CloudAccount {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id', nullable: true })
    organizationId!: string | null;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @Column({ type: 'varchar', length: 10 })
    provider!: CloudProvider;

    @Column({ type: 'text', name: 'credentials_encrypted', select: false })
    credentialsEncrypted!: string;

    @Column({ type: 'varchar', length: 100 })
    alias!: string;

    @Column({ type: 'boolean', default: true, name: 'is_active' })
    isActive!: boolean;

    @Column({ type: 'timestamp', nullable: true, name: 'last_general_sync_at' })
    lastGeneralSyncAt!: Date | null;

    @Column({ type: 'boolean', default: false, name: 'is_general_sync_in_progress' })
    isGeneralSyncInProgress!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization | null;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Tenant;
}
