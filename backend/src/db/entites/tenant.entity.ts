import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    type Relation
} from 'typeorm';
import { TenantMember } from './tenant-member.entity';

@Entity('tenants')
export class Tenant {
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

    @Column({ type: 'simple-array', name: 'plans', default: '' })
    plans!: string[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @OneToMany(() => TenantMember, (member) => member.tenant)
    members!: Relation<TenantMember[]>;
}
