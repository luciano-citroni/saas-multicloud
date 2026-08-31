import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Automation } from './automation.entity';

@Entity('automation_versions')
export class AutomationVersion {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'automation_id' })
    automationId!: string;

    @ManyToOne(() => Automation, (automation) => automation.versions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'automation_id' })
    automation!: Automation;

    @Column({ type: 'int' })
    version!: number;

    @Column({ type: 'jsonb' })
    snapshot!: Record<string, unknown>;

    @Column({ type: 'uuid', name: 'published_by', nullable: true })
    publishedBy!: string | null;

    @CreateDateColumn({ name: 'published_at' })
    publishedAt!: Date;
}
