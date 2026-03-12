import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

export type AssessmentStatus = 'pending' | 'running' | 'completed' | 'failed';

@Entity('aws_assessment_jobs')
export class AwsAssessmentJob {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    cloudAccountId: string;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloudAccountId' })
    cloudAccount: CloudAccount;

    @Column()
    organizationId: string;

    @Column({ type: 'varchar', default: 'pending' })
    status: AssessmentStatus;

    @Column({ type: 'text', nullable: true })
    error: string | null;

    @Column({ type: 'varchar', nullable: true })
    excelFileName: string | null;

    @Column({ type: 'timestamp', nullable: true })
    completedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
