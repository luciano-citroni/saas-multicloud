import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

import { AwsVpc } from './aws-vpc.entity';

/**


 * Representa uma hosted zone do Route53 sincronizada da Amazon Web Services.


 *


 * Isolamento de tenant:


 * - A hosted zone está vinculada à CloudAccount, que já pertence a uma organização.


 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.


 */

@Entity('aws_route53_hosted_zones')
export class AwsRoute53HostedZone {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ID da hosted zone na AWS (ex: /hostedzone/Z1D633PJN98FT9). */

    @Column({ type: 'varchar', length: 255, name: 'aws_hosted_zone_id', unique: true })
    awsHostedZoneId!: string;

    /** Nome DNS da zona (ex: example.com.). */

    @Column({ type: 'varchar', length: 1024, name: 'name' })
    name!: string;

    /** Tipo: PUBLIC ou PRIVATE. */

    @Column({ type: 'varchar', length: 10, name: 'zone_type' })
    zoneType!: string;

    /** Quantidade de record sets na zona. */

    @Column({ type: 'int', name: 'record_set_count', nullable: true })
    recordSetCount!: number | null;

    /** Comentário da zona. */

    @Column({ type: 'varchar', length: 1024, name: 'comment', nullable: true })
    comment!: string | null;

    /** ID da VPC na AWS (apenas zonas privadas). */

    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id', nullable: true })
    awsVpcId!: string | null;

    /** ID da VPC no banco de dados. */

    @Column({ type: 'uuid', name: 'vpc_id', nullable: true })
    vpcId!: string | null;

    /** Indica se a zona é privada. */

    @Column({ type: 'boolean', name: 'is_private', default: false })
    isPrivate!: boolean;

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

    @ManyToOne(() => AwsVpc, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'vpc_id' })
    vpc!: AwsVpc | null;
}
