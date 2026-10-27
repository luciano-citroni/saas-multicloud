import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    type Relation
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

export enum TenantInviteStatus {
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    EXPIRED = 'EXPIRED',
}

@Entity('tenant_invites')
export class TenantInvite {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @Column({ type: 'varchar', length: 255 })
    email!: string;

    @Column({ type: 'varchar', length: 50 })
    role!: string;

    @Column({ type: 'uuid', array: true, name: 'organization_ids', default: () => "'{}'" })
    organizationIds!: string[];

    @Column({ type: 'uuid', unique: true })
    token!: string;

    @Column({ type: 'varchar', length: 20, default: TenantInviteStatus.PENDING })
    status!: string;

    @Column({ type: 'uuid', name: 'invited_by_user_id', nullable: true })
    invitedByUserId!: string;

    @Column({ type: 'timestamp', name: 'expires_at' })
    expiresAt!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'invited_by_user_id' })
    invitedBy!: Relation<User>;
}
