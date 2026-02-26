import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

/**
 * Providers de cloud suportados.
 * Adicionar novos providers aqui e na migration correspondente.
 */
export enum CloudProvider {
    AWS = 'aws',
    AZURE = 'azure',
    GCP = 'gcp',
}

/**
 * Conta de cloud vinculada a uma organização (tenant).
 *
 * Segurança:
 * - `credentialsEncrypted` NUNCA deve ser retornado em respostas de API.
 *   Use `@Exclude()` do class-transformer ou select: false em queries.
 * - As credenciais devem ser criptografadas com AES-256-GCM antes de persistir.
 *   Use um EncryptionService com chave derivada do env (ex: CREDENTIALS_ENCRYPTION_KEY).
 * - A chave de criptografia deve ser rotacionada periodicamente.
 *
 * Isolamento de tenant:
 * - Toda query DEVE filtrar por organizationId do contexto atual (TenantGuard).
 * - Nunca exponha contas de uma org para outra.
 */
@Entity('cloud_accounts')
export class CloudAccount {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'varchar', length: 10 })
    provider!: CloudProvider;

    /**
     * Credenciais criptografadas (AES-256-GCM).
     * Formato sugerido: `iv:authTag:ciphertext` em base64.
     * Nunca retorne este campo em respostas de API.
     */
    @Column({ type: 'text', name: 'credentials_encrypted', select: false })
    credentialsEncrypted!: string;

    /**
     * Nome/alias legível para identificar a conta (ex: "Produção AWS", "Dev GCP").
     * Facilita a UI sem expor credenciais.
     */
    @Column({ type: 'varchar', length: 100 })
    alias!: string;

    @Column({ type: 'boolean', default: true, name: 'is_active' })
    isActive!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;
}
