import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

/**


 * Representa uma VPC sincronizada da Amazon Web Services.


 *


 * Isolamento de tenant:


 * - A VPC está vinculada à CloudAccount, que já pertence a uma organização.


 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.


 */

@Entity('aws_vpcs')
export class AwsVpc {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**


     * ID da CloudAccount que esta VPC pertence.


     */

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**


     * VPC ID na AWS (ex: vpc-0a1b2c3d4e5f67890).


     */

    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id', unique: true })
    awsVpcId!: string;

    /**


     * Bloco CIDR da VPC (ex: 10.0.0.0/16).


     */

    @Column({ type: 'varchar', length: 50, name: 'cidr_block' })
    cidrBlock!: string;

    /**


     * Estado da VPC (available, pending, deleted).


     */

    @Column({ type: 'varchar', length: 20, name: 'state' })
    state!: string;

    /**


     * Indicador se é a VPC padrão da conta.


     */

    @Column({ type: 'boolean', name: 'is_default', default: false })
    isDefault!: boolean;

    /**


     * Tags da VPC em JSON (ex: {"Name": "prod-vpc", "Environment": "production"}).


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

    @OneToMany('AwsSubnet', 'vpc')
    subnets!: any[];
}
