import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_cloud_run_jobs')
@Unique(['cloudAccountId', 'gcpJobName'])
export class GcpCloudRunJob {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**
     * Full resource name: projects/{project}/locations/{region}/jobs/{job}
     */
    @Column({ type: 'varchar', length: 500, name: 'gcp_job_name' })
    gcpJobName!: string;

    /** Short display name */
    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** us-central1, europe-west1, etc. */
    @Column({ type: 'varchar', length: 100 })
    region!: string;

    /** CONDITION_SUCCEEDED, CONDITION_FAILED, etc. */
    @Column({ type: 'varchar', length: 50, nullable: true })
    condition!: string | null;

    /** Container image used by the job template */
    @Column({ type: 'varchar', length: 500, name: 'container_image', nullable: true })
    containerImage!: string | null;

    /** CPU limit (e.g. "1000m") */
    @Column({ type: 'varchar', length: 30, name: 'cpu_limit', nullable: true })
    cpuLimit!: string | null;

    /** Memory limit (e.g. "512Mi") */
    @Column({ type: 'varchar', length: 30, name: 'memory_limit', nullable: true })
    memoryLimit!: string | null;

    /** Number of task instances per execution */
    @Column({ type: 'integer', name: 'task_count', nullable: true })
    taskCount!: number | null;

    /** Max retries per task */
    @Column({ type: 'integer', name: 'max_retries', nullable: true })
    maxRetries!: number | null;

    /** Total number of executions */
    @Column({ type: 'integer', name: 'execution_count', nullable: true })
    executionCount!: number | null;

    /** Name of the latest created execution (short name) */
    @Column({ type: 'varchar', length: 300, name: 'latest_created_execution', nullable: true })
    latestCreatedExecution!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    labels!: Record<string, string> | null;

    @Column({ type: 'timestamp', name: 'create_time', nullable: true })
    createTime!: Date | null;

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
