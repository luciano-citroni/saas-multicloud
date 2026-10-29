import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    type Relation
} from 'typeorm';
import { UserSession } from './user-session.entity';
import { OrganizationMembership } from './organization-membership.entity';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', length: 255, unique: true })
    email!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    password!: string | null;

    @Column({ type: 'varchar', length: 255, unique: true, nullable: true, name: 'google_id' })
    googleId!: string | null;

    @Column({ type: 'boolean', default: true, name: 'is_active' })
    isActive!: boolean;

    @Column({ type: 'boolean', default: false, name: 'email_verified' })
    emailVerified!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @OneToMany(() => UserSession, (session) => session.user)
    sessions!: Relation<UserSession[]>;

    @OneToMany(() => OrganizationMembership, (member) => member.user)
    organizationMemberships!: Relation<OrganizationMembership[]>;
}
