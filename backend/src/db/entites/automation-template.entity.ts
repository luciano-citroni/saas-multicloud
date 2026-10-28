import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { AutomationTemplateVersion } from './automation-template-version.entity';

export enum AutomationTemplateOrigin {
    PLATFORM = 'PLATFORM',
    ORGANIZATION = 'ORGANIZATION',
    IMPORT = 'IMPORT',
}

export enum AutomationTemplateType {
    CLOUDFORMATION = 'CLOUDFORMATION',
}

@Entity('automation_templates')
export class AutomationTemplate {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
    tenantId!: string | null;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant | null>;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ type: 'varchar', length: 10, name: 'cloud_provider', default: 'AWS' })
    cloudProvider!: string;

    @Column({ type: 'varchar', length: 32, name: 'template_type', default: AutomationTemplateType.CLOUDFORMATION })
    templateType!: AutomationTemplateType;

    @Column({ type: 'varchar', length: 20, default: AutomationTemplateOrigin.ORGANIZATION })
    origin!: AutomationTemplateOrigin;

    @Column({ type: 'uuid', name: 'created_by', nullable: true })
    createdBy!: string | null;

    @OneToMany(() => AutomationTemplateVersion, (version) => version.template)
    versions!: Relation<AutomationTemplateVersion[]>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
