import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';

@Entity('organization_members')
export class OrganizationMember {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'user_id' })
    userId!: string;

    @Column({ type: 'varchar', length: 50 })
    role!: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', name: 'joined_at' })
    joinedAt!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => Organization, (organization) => organization.members, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;

    @ManyToOne(() => User, (user) => user.organizationMemberships, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user!: User;
}
