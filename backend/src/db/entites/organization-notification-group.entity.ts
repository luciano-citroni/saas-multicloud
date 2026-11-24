import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';

import { Organization } from './organization.entity';
import { OrganizationNotificationEmail } from './organization-notification-email.entity';
import { OrganizationNotificationWhatsappTarget } from './organization-notification-whatsapp-target.entity';

export type NotificationChannel = 'email' | 'whatsapp';

@Entity('organization_notification_groups')
@Index('idx_org_notification_groups_tenant_mid_org', ['organizationId', 'midOrgId'])
export class OrganizationNotificationGroup {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /** Tenant id (header x-organization-id). */
    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    /** Mid-org (organizations.id). Null when the group is tenant-global. */
    @Column({ type: 'uuid', name: 'mid_org_id', nullable: true })
    midOrgId!: string | null;

    /** When true, group is shared across all mid-orgs of the tenant. */
    @Column({ type: 'boolean', name: 'is_tenant_global', default: false })
    isTenantGlobal!: boolean;

    @Column({ type: 'varchar', length: 120 })
    name!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description!: string | null;

    @Column({ type: 'varchar', length: 20, default: 'email' })
    channel!: NotificationChannel;

    @Column({ type: 'boolean', name: 'is_active', default: true })
    isActive!: boolean;

    @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'mid_org_id' })
    midOrg!: Relation<Organization> | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @OneToMany(() => OrganizationNotificationEmail, (email) => email.group, {
        cascade: true,
    })
    emails!: Relation<OrganizationNotificationEmail>[];

    @OneToMany(() => OrganizationNotificationWhatsappTarget, (target) => target.group, {
        cascade: true,
    })
    whatsappTargets!: Relation<OrganizationNotificationWhatsappTarget>[];
}
