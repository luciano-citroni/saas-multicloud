import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('virtual_machines', { schema: 'azure' })
@Unique('UQ_azure_virtual_machines_account_azure_id', ['cloudAccountId', 'azureId'])
export class AzureVirtualMachine {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ID ARM completo do recurso Azure. */
    @Column({ type: 'text', name: 'azure_id' })
    azureId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    location!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'resource_group', nullable: true })
    resourceGroup!: string | null;

    @Column({ type: 'varchar', length: 36, name: 'subscription_id', nullable: true })
    subscriptionId!: string | null;

    @Column({ type: 'varchar', length: 100, name: 'vm_size', nullable: true })
    vmSize!: string | null;

    @Column({ type: 'varchar', length: 20, name: 'os_type', nullable: true })
    osType!: string | null;

    @Column({ type: 'varchar', length: 50, name: 'provisioning_state', nullable: true })
    provisioningState!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    tags!: Record<string, string> | null;

    @Column({ type: 'jsonb', nullable: true })
    properties!: Record<string, any> | null;

    @Column({ type: 'timestamp', name: 'last_synced_at', nullable: true })
    lastSyncedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;
}
