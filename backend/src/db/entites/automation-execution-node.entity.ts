import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    type Relation
} from 'typeorm';
import { AutomationExecution } from './automation-execution.entity';

export enum AutomationExecutionNodeStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
    SKIPPED = 'SKIPPED',
}

@Entity('automation_execution_nodes')
export class AutomationExecutionNode {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'execution_id' })
    executionId!: string;

    @ManyToOne(() => AutomationExecution, (execution) => execution.executionNodes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'execution_id' })
    execution!: Relation<AutomationExecution>;

    @Column({ type: 'uuid', name: 'node_id' })
    nodeId!: string;

    @Column({ type: 'varchar', length: 20, default: AutomationExecutionNodeStatus.PENDING })
    status!: AutomationExecutionNodeStatus;

    @Column({ type: 'timestamp', name: 'started_at', nullable: true })
    startedAt!: Date | null;

    @Column({ type: 'timestamp', name: 'finished_at', nullable: true })
    finishedAt!: Date | null;

    @Column({ type: 'jsonb', nullable: true })
    input!: Record<string, unknown> | null;

    @Column({ type: 'jsonb', nullable: true })
    output!: Record<string, unknown> | null;

    @Column({ type: 'text', nullable: true })
    error!: string | null;

    @Column({ type: 'varchar', name: 'resource_id', length: 512, nullable: true })
    resourceId!: string | null;
}
