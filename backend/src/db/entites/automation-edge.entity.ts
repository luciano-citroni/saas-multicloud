import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Automation } from './automation.entity';
import { AutomationNode } from './automation-node.entity';

@Entity('automation_edges')
export class AutomationEdge {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'automation_id' })
    automationId!: string;

    @ManyToOne(() => Automation, (automation) => automation.edges, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'automation_id' })
    automation!: Automation;

    @Column({ type: 'uuid', name: 'source_node_id' })
    sourceNodeId!: string;

    @ManyToOne(() => AutomationNode, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'source_node_id' })
    sourceNode!: AutomationNode;

    @Column({ type: 'uuid', name: 'target_node_id' })
    targetNodeId!: string;

    @ManyToOne(() => AutomationNode, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'target_node_id' })
    targetNode!: AutomationNode;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
