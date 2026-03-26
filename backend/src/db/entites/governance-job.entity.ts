import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

export type GovernanceJobStatus = 'pending' | 'running' | 'completed' | 'failed';

@Entity('governance_jobs')
export class GovernanceJob {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'varchar', length: 20, default: 'aws' })
    provider!: string;

    @Column({ type: 'varchar', length: 20, default: 'pending' })
    status!: GovernanceJobStatus;

    /** Score de 0 a 100 calculado após a conclusão do scan. */
    @Column({ type: 'int', name: 'score', nullable: true })
    score!: number | null;

    /** Número de achados não-conformes ou warnings encontrados. */
    @Column({ type: 'int', name: 'total_findings', nullable: true })
    totalFindings!: number | null;

    /** Número total de verificações executadas (resources × policies). */
    @Column({ type: 'int', name: 'total_checks', nullable: true })
    totalChecks!: number | null;

    @Column({ type: 'text', nullable: true })
    error!: string | null;

    @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
    completedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;
}
