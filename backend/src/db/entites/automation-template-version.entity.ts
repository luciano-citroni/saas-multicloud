import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';
import { AutomationTemplate } from './automation-template.entity';

@Entity('automation_template_versions')
export class AutomationTemplateVersion {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'template_id' })
    templateId!: string;

    @ManyToOne(() => AutomationTemplate, (template) => template.versions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'template_id' })
    template!: Relation<AutomationTemplate>;

    @Column({ type: 'int' })
    version!: number;

    @Column({ type: 'text' })
    content!: string;

    @Column({ type: 'varchar', length: 64, name: 'content_hash' })
    contentHash!: string;

    @Column({ type: 'varchar', length: 10 })
    format!: string;

    @Column({ type: 'jsonb', default: [] })
    parameters!: Record<string, unknown>[];

    @Column({ type: 'jsonb', default: [] })
    outputs!: Record<string, unknown>[];

    @Column({ type: 'jsonb', default: [] })
    resources!: Record<string, unknown>[];

    @Column({ type: 'boolean', name: 'has_transform', default: false })
    hasTransform!: boolean;

    @Column({ type: 'uuid', name: 'created_by', nullable: true })
    createdBy!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
