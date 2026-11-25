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
import { AwsVpc } from './aws-vpc.entity';

/**
 * Entrada (regra) de uma Network ACL.
 */
export interface NetworkAclEntry {
    ruleNumber: number;
    protocol: string;
    ruleAction: string;
    egress: boolean;
    cidrBlock?: string | null;
    ipv6CidrBlock?: string | null;
    portRange?: { from: number | null; to: number | null } | null;
    icmpTypeCode?: { type: number | null; code: number | null } | null;
}

/**
 * Associação de Network ACL a uma subnet.
 */
export interface NetworkAclAssociation {
    networkAclAssociationId?: string | null;
    subnetId: string;
}

/**
 * Representa uma Network ACL sincronizada da Amazon Web Services.
 */
@Entity('aws_network_acls')
export class AwsNetworkAcl {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ID da Network ACL na AWS (ex: acl-0a1b2c3d). */
    @Column({ type: 'varchar', length: 50, name: 'aws_network_acl_id', unique: true })
    awsNetworkAclId!: string;

    /** ID da VPC na AWS. */
    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id', nullable: true })
    awsVpcId!: string | null;

    /** FK para a VPC no banco. */
    @Column({ type: 'uuid', name: 'vpc_id', nullable: true })
    vpcId!: string | null;

    /** Região AWS. */
    @Column({ type: 'varchar', length: 32, name: 'region', nullable: true })
    region!: string | null;

    /** Se é a NACL default da VPC. */
    @Column({ type: 'boolean', name: 'is_default', default: false })
    isDefault!: boolean;

    /** Entradas (regras) da NACL. */
    @Column({ type: 'jsonb', name: 'entries', nullable: true })
    entries!: NetworkAclEntry[] | null;

    /** Associações com subnets. */
    @Column({ type: 'jsonb', name: 'associations', nullable: true })
    associations!: NetworkAclAssociation[] | null;

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

    @ManyToOne(() => AwsVpc, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'vpc_id' })
    vpc!: Relation<AwsVpc | null>;
}
