import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { OrganizationMember } from './organization-member.entity';

@Entity('organizations')
export class Organization {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', length: 100 })
    name!: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    cnpj?: string | null;

    @Column({ type: 'integer', name: 'max_cloud_accounts', default: 0 })
    maxCloudAccounts!: number;

    @Column({ type: 'integer', name: 'max_users', default: 0 })
    maxUsers!: number;

    @Column('text', { name: 'plans', array: true, default: () => "'{}'" })
    plans!: string[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @OneToMany(() => OrganizationMember, (member) => member.organization)
    members!: OrganizationMember[];
}
