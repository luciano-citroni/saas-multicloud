import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

import { AwsVpc } from './aws-vpc.entity';

/**

 * Representa uma regra de entrada ou saída de um Security Group.

 */

export interface SecurityGroupRule {
    /** Protocolo: tcp, udp, icmp, -1 (todos) */

    protocol: string;

    /** Porta inicial (-1 para todos) */

    fromPort: number | null;

    /** Porta final (-1 para todos) */

    toPort: number | null;

    /** Faixas de IP IPv4 permitidas (CIDR) */

    ipv4Ranges: { cidr: string; description?: string }[];

    /** Faixas de IP IPv6 permitidas (CIDR) */

    ipv6Ranges: { cidr: string; description?: string }[];

    /** Security Groups referenciados */

    referencedSecurityGroups: { groupId: string; userId: string; vpcId?: string; securityGroupId?: string }[];

    /** Prefix Lists referenciadas */

    prefixListIds: { prefixListId: string; description?: string }[];

    /** Descrição da regra */

    description?: string;
}

/**

 * Representa um Security Group sincronizado da Amazon Web Services.

 *

 * Isolamento de tenant:

 * - O Security Group está vinculado à CloudAccount, que já pertence a uma organização.

 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.

 */

@Entity('aws_security_groups')
export class AwsSecurityGroup {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**

     * ID da CloudAccount que este Security Group pertence.

     */

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**

     * ID do Security Group na AWS (ex: sg-0a1b2c3d4e5f67890).

     */

    @Column({ type: 'varchar', length: 50, name: 'aws_security_group_id', unique: true })
    awsSecurityGroupId!: string;

    /**

     * Nome do Security Group.

     */

    @Column({ type: 'varchar', length: 255, name: 'name' })
    name!: string;

    /**

     * Descrição do Security Group.

     */

    @Column({ type: 'text', name: 'description' })
    description!: string;

    /**

     * ID da VPC na AWS à qual este Security Group pertence.

     * Null para Security Groups do EC2-Classic (legacy).

     */

    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id', nullable: true })
    awsVpcId!: string | null;

    /**

     * ID da VPC no banco de dados.

     */

    @Column({ type: 'uuid', name: 'vpc_id', nullable: true })
    vpcId!: string | null;

    /**

     * ID da conta AWS proprietária do Security Group.

     */

    @Column({ type: 'varchar', length: 50, name: 'owner_id' })
    ownerId!: string;

    /**

     * Regras de entrada (inbound/ingress) do Security Group.

     */

    @Column({ type: 'jsonb', name: 'inbound_rules', nullable: true })
    inboundRules!: SecurityGroupRule[] | null;

    /**

     * Regras de saída (outbound/egress) do Security Group.

     */

    @Column({ type: 'jsonb', name: 'outbound_rules', nullable: true })
    outboundRules!: SecurityGroupRule[] | null;

    /**

     * Tags do Security Group em JSON.

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

    @ManyToOne(() => AwsVpc, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'vpc_id' })
    vpc!: AwsVpc | null;
}
