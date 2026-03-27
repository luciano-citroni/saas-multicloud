import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

export type FinopsCloudProvider = 'aws' | 'azure';

@Entity('finops_consents')
export class FinopsConsent {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20, name: 'cloud_provider' })
    cloudProvider!: FinopsCloudProvider;

    @Column({ type: 'boolean', default: false })
    accepted!: boolean;

    @Column({ type: 'timestamp', name: 'accepted_at', nullable: true })
    acceptedAt!: Date | null;

    /** Versão do termo de consentimento aceito pelo usuário. */
    @Column({ type: 'varchar', length: 20, default: '1.0' })
    version!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;
}
