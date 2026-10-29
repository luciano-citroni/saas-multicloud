import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';

import { OrganizationNotificationGroup } from './organization-notification-group.entity';

export type WhatsappTargetType = 'phone' | 'group';

@Entity('organization_notification_whatsapp_targets')
@Index('uq_org_notification_whatsapp_targets_group_type_target', ['groupId', 'targetType', 'target'], {
    unique: true,
})
export class OrganizationNotificationWhatsappTarget {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'group_id' })
    groupId!: string;

    @Column({ type: 'varchar', length: 20, name: 'target_type' })
    targetType!: WhatsappTargetType;

    /** Phone E.164 digits (no +) or WhatsApp group JID (...@g.us). */
    @Column({ type: 'varchar', length: 120 })
    target!: string;

    @Column({ type: 'varchar', length: 120, nullable: true })
    label!: string | null;

    @Column({ type: 'boolean', name: 'is_active', default: true })
    isActive!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => OrganizationNotificationGroup, (group) => group.whatsappTargets, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'group_id' })
    group!: Relation<OrganizationNotificationGroup>;
}
