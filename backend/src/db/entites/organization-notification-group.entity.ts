import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';

import { OrganizationNotificationEmail } from './organization-notification-email.entity';

export type NotificationChannel = 'email' | 'whatsapp';

@Entity('organization_notification_groups')
@Index('uq_org_notification_groups_org_channel_name', ['organizationId', 'channel', 'name'], {
    unique: true,
})
export class OrganizationNotificationGroup {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'varchar', length: 120 })
    name!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description!: string | null;

    @Column({ type: 'varchar', length: 20, default: 'email' })
    channel!: NotificationChannel;

    @Column({ type: 'boolean', name: 'is_active', default: true })
    isActive!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @OneToMany(() => OrganizationNotificationEmail, (email) => email.group, {
        cascade: true,
    })
    emails!: Relation<OrganizationNotificationEmail>[];
}
