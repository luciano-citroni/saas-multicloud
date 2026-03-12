import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

/**
 * Representa um detector do GuardDuty sincronizado da Amazon Web Services.
 */
@Entity('aws_guardduty_detectors')
export class AwsGuardDutyDetector {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ID do detector na AWS. */
    @Column({ type: 'varchar', length: 255, name: 'detector_id', unique: true })
    detectorId!: string;

    /** Status do detector (ENABLED ou DISABLED). */
    @Column({ type: 'varchar', length: 20, name: 'status', nullable: true })
    status!: string | null;

    /** Frequência de publicação de findings (SIX_HOURS, ONE_HOUR, FIFTEEN_MINUTES). */
    @Column({ type: 'varchar', length: 30, name: 'finding_publishing_frequency', nullable: true })
    findingPublishingFrequency!: string | null;

    /** ARN da service role. */
    @Column({ type: 'varchar', length: 2048, name: 'service_role', nullable: true })
    serviceRole!: string | null;

    /** Número total de findings. */
    @Column({ type: 'int', name: 'findings_count', nullable: true })
    findingsCount!: number | null;

    /** Fontes de dados habilitadas em JSON. */
    @Column({ type: 'jsonb', name: 'data_sources', nullable: true })
    dataSources!: Record<string, any> | null;

    /** Features habilitadas em JSON. */
    @Column({ type: 'jsonb', name: 'features', nullable: true })
    features!: Record<string, any>[] | null;

    /** Data de criação na AWS. */
    @Column({ type: 'timestamp', name: 'created_at_aws', nullable: true })
    createdAtAws!: Date | null;

    /** Data da última atualização na AWS. */
    @Column({ type: 'timestamp', name: 'updated_at_aws', nullable: true })
    updatedAtAws!: Date | null;

    /** Tags em JSON. */
    @Column({ type: 'jsonb', nullable: true })
    tags!: Record<string, string> | null;

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
