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
import { Tenant } from './tenant.entity';
import { AiFinopsConnection } from './ai-finops-connection.entity';

@Entity('ai_finops_credentials')
@Index('IDX_ai_finops_credentials_tenant_connection', ['tenantId', 'connectionId'], { unique: true })
export class AiFinopsCredential {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'connection_id' })
    connectionId!: string;

    @ManyToOne(() => AiFinopsConnection, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'connection_id' })
    connection!: Relation<AiFinopsConnection>;

    @Column({ type: 'varchar', length: 64, name: 'credential_type', default: 'api_key' })
    credentialType!: string;

    @Column({ type: 'text', name: 'encrypted_value', select: false })
    encryptedValue!: string;

    @Column({ type: 'varchar', length: 64, name: 'masked_hint', nullable: true })
    maskedHint!: string | null;

    @Column({ type: 'jsonb', name: 'encryption_metadata', default: '{}' })
    encryptionMetadata!: Record<string, unknown>;

    @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
    expiresAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
