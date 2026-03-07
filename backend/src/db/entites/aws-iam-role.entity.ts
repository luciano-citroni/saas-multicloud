import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

/**
 * Representa uma role IAM sincronizada da Amazon Web Services.
 *
 * Isolamento de tenant:
 * - A role está vinculada à CloudAccount, que já pertence a uma organização.
 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.
 */
@Entity('aws_iam_roles')
export class AwsIamRole {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**
     * ID da CloudAccount que esta role pertence.
     */
    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**
     * ID único estável da role na AWS (ex: AROAI3UMHVBPQEXAMPLE).
     */
    @Column({ type: 'varchar', length: 128, name: 'aws_role_id', unique: true })
    awsRoleId!: string;

    /**
     * ARN da role (ex: arn:aws:iam::123456789012:role/MyRole).
     */
    @Column({ type: 'varchar', length: 2048, name: 'role_arn' })
    roleArn!: string;

    /**
     * Nome da role IAM.
     */
    @Column({ type: 'varchar', length: 128, name: 'role_name' })
    roleName!: string;

    /**
     * Caminho da role (ex: /, /service-role/, /aws-service-role/).
     */
    @Column({ type: 'varchar', length: 512, name: 'path', default: '/' })
    path!: string;

    /**
     * Descrição da role.
     */
    @Column({ type: 'text', name: 'description', nullable: true })
    description!: string | null;

    /**
     * Política de confiança (trust policy / assume role policy document) em JSON.
     */
    @Column({ type: 'jsonb', name: 'assume_role_policy_document', nullable: true })
    assumeRolePolicyDocument!: Record<string, any> | null;

    /**
     * Duração máxima da sessão em segundos (padrão: 3600).
     */
    @Column({ type: 'int', name: 'max_session_duration', default: 3600 })
    maxSessionDuration!: number;

    /**
     * ARN do permissions boundary aplicado à role, se houver.
     */
    @Column({ type: 'varchar', length: 2048, name: 'permissions_boundary_arn', nullable: true })
    permissionsBoundaryArn!: string | null;

    /**
     * Políticas gerenciadas (managed) anexadas à role.
     * Array de objetos { policyName, policyArn }.
     */
    @Column({ type: 'jsonb', name: 'attached_policies', nullable: true })
    attachedPolicies!: { policyName: string; policyArn: string }[] | null;

    /**
     * Nomes das políticas inline da role.
     */
    @Column({ type: 'jsonb', name: 'inline_policy_names', nullable: true })
    inlinePolicyNames!: string[] | null;

    /**
     * Última vez que a role foi utilizada e em qual região.
     */
    @Column({ type: 'jsonb', name: 'role_last_used', nullable: true })
    roleLastUsed!: { lastUsedDate: Date | null; region: string | null } | null;

    /**
     * Data de criação da role na AWS.
     */
    @Column({ type: 'timestamp', name: 'created_date_aws', nullable: true })
    createdDateAws!: Date | null;

    /**
     * Tags da role.
     */
    @Column({ type: 'jsonb', nullable: true })
    tags!: Record<string, string> | null;

    /**
     * Timestamp da última sincronização com AWS.
     */
    @Column({ type: 'timestamp', name: 'last_synced_at', nullable: true })
    lastSyncedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;
}
