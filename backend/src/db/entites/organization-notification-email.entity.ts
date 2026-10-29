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

@Entity('organization_notification_emails')
@Index('uq_org_notification_emails_group_email', ['groupId', 'email'], { unique: true })
export class OrganizationNotificationEmail {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'group_id' })
    groupId!: string;

    @Column({ type: 'varchar', length: 320 })
    email!: string;

    /** Nome amigável opcional. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    label!: string | null;

    @Column({ type: 'boolean', name: 'is_active', default: true })
    isActive!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => OrganizationNotificationGroup, (group) => group.emails, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'group_id' })
    group!: Relation<OrganizationNotificationGroup>;
}
