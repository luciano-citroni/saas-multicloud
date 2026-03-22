import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

export type AzureAssessmentStatus = 'pending' | 'running' | 'completed' | 'failed';

@Entity('azure_assessment_jobs')
export class AzureAssessmentJob {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'varchar', length: 20, default: 'pending' })
    status!: AzureAssessmentStatus;

    @Column({ type: 'text', nullable: true })
    error!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'excel_file_name', nullable: true })
    excelFileName!: string | null;

    @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
    completedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
