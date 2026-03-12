import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { UserSession } from './user-session.entity';
import { OrganizationMember } from './organization-member.entity';

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

    @Column({ type: 'varchar', length: 14, unique: true, nullable: true })
    cpf!: string | null;

    @Column({ type: 'varchar', length: 255, unique: true, nullable: true, name: 'google_id' })
    googleId!: string | null;

    @Column({ type: 'boolean', default: true, name: 'is_active' })
    isActive!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @OneToMany(() => UserSession, (session) => session.user)
    sessions!: UserSession[];

    @OneToMany(() => OrganizationMember, (member) => member.user)
    organizationMemberships!: OrganizationMember[];
}
