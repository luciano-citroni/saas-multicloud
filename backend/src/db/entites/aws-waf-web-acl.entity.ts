import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

/**
 * Representa uma Web ACL do WAFv2 sincronizada da Amazon Web Services.
 */
@Entity('aws_waf_web_acls')
export class AwsWafWebAcl {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ID da Web ACL na AWS. */
    @Column({ type: 'varchar', length: 255, name: 'aws_web_acl_id' })
    awsWebAclId!: string;

    /** ARN da Web ACL na AWS. */
    @Column({ type: 'varchar', length: 2048, name: 'web_acl_arn', unique: true })
    webAclArn!: string;

    /** Nome da Web ACL. */
    @Column({ type: 'varchar', length: 255, name: 'name' })
    name!: string;

    /** Descrição da Web ACL. */
    @Column({ type: 'varchar', length: 1024, name: 'description', nullable: true })
    description!: string | null;

    /** Escopo (CLOUDFRONT ou REGIONAL). */
    @Column({ type: 'varchar', length: 20, name: 'scope' })
    scope!: string;

    /** Capacidade usada pelas regras (WCU). */
    @Column({ type: 'int', name: 'capacity', nullable: true })
    capacity!: number | null;

    /** Ação padrão (ALLOW ou BLOCK). */
    @Column({ type: 'varchar', length: 10, name: 'default_action', nullable: true })
    defaultAction!: string | null;

    /** Número de regras na Web ACL. */
    @Column({ type: 'int', name: 'rules_count', nullable: true })
    rulesCount!: number | null;

    /** ARNs dos recursos associados. */
    @Column({ type: 'jsonb', name: 'associated_resources', nullable: true })
    associatedResources!: string[] | null;

    /** Tags em JSON. */
    @Column({ type: 'jsonb', nullable: true })
    tags!: Record<string, string> | null;

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
