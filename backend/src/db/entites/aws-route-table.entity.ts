import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { AwsVpc } from './aws-vpc.entity';

/**


 * Representa uma Route Table sincronizada da Amazon Web Services.


 *


 * Isolamento de tenant:


 * - A Route Table está vinculada à VPC, que pertence à CloudAccount.


 * - A CloudAccount pertence a uma organização.


 * - Sempre filtrar por vpc.cloudAccount.organizationId para garantir isolamento.


 */

@Entity('aws_route_tables')
export class AwsRouteTable {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**


     * ID da VPC que esta Route Table pertence.


     */

    @Column({ type: 'uuid', name: 'vpc_id' })
    vpcId!: string;

    /**


     * Route Table ID na AWS (ex: rtb-0a1b2c3d4e5f67890).


     */

    @Column({ type: 'varchar', length: 50, name: 'aws_route_table_id', unique: true })
    awsRouteTableId!: string;

    /**


     * VPC ID na AWS (denormalizado para facilitar queries).


     */

    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id' })
    awsVpcId!: string;

    /**


     * Indicador se é a route table principal da VPC.


     */

    @Column({ type: 'boolean', name: 'is_main', default: false })
    isMain!: boolean;

    /**


     * Rotas da Route Table em JSON.


     * Estrutura: [{ destinationCidr: string, target: string, state: string }]


     */

    @Column({ type: 'jsonb', nullable: true })
    routes!: Array<{
        destinationCidr: string;

        target: string;

        targetType: string; // gateway, nat-gateway, instance, vpc-peering, etc.

        state: string;
    }> | null;

    /**


     * Associações da route table com subnets em JSON.


     * Estrutura: [{ subnetId: string, associationId: string, isMain: boolean }]


     */

    @Column({ type: 'jsonb', nullable: true })
    associations!: Array<{
        subnetId: string;

        associationId: string;

        isMain: boolean;
    }> | null;

    /**


     * Tags da Route Table em JSON (ex: {"Name": "prod-public-rt", "Environment": "production"}).


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

    @ManyToOne(() => AwsVpc, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'vpc_id' })
    vpc!: AwsVpc;
}
