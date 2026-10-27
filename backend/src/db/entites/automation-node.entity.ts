import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation
} from 'typeorm';
import { Automation } from './automation.entity';

@Entity('automation_nodes')
export class AutomationNode {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'automation_id' })
    automationId!: string;

    @ManyToOne(() => Automation, (automation) => automation.nodes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'automation_id' })
    automation!: Relation<Automation>;

    @Column({ type: 'varchar', length: 100 })
    type!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'jsonb', default: {} })
    config!: Record<string, unknown>;

    @Column({ type: 'jsonb', nullable: true })
    position!: { x: number; y: number } | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
