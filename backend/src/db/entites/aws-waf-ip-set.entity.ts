import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

/**
 * Representa um IP Set do WAFv2 sincronizado da Amazon Web Services.
 */
@Entity('aws_waf_ip_sets')
export class AwsWafIpSet {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ID do IP Set na AWS. */
    @Column({ type: 'varchar', length: 255, name: 'aws_ip_set_id' })
    awsIpSetId!: string;

    /** ARN do IP Set na AWS. */
    @Column({ type: 'varchar', length: 2048, name: 'ip_set_arn', unique: true })
    ipSetArn!: string;

    /** Nome do IP Set. */
    @Column({ type: 'varchar', length: 255, name: 'name' })
    name!: string;

    /** Descrição do IP Set. */
    @Column({ type: 'varchar', length: 1024, name: 'description', nullable: true })
    description!: string | null;

    /** Escopo (CLOUDFRONT ou REGIONAL). */
    @Column({ type: 'varchar', length: 20, name: 'scope' })
    scope!: string;

    /** Região AWS (us-east-1 para CLOUDFRONT). */
    @Column({ type: 'varchar', length: 32, name: 'region', nullable: true })
    region!: string | null;

    /** Versão do endereço IP (IPV4 ou IPV6). */
    @Column({ type: 'varchar', length: 10, name: 'ip_address_version', nullable: true })
    ipAddressVersion!: string | null;

    /** Lista de endereços/CIDRs no IP Set. */
    @Column({ type: 'jsonb', name: 'addresses', nullable: true })
    addresses!: string[] | null;

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
    cloudAccount!: Relation<CloudAccount>;
}
