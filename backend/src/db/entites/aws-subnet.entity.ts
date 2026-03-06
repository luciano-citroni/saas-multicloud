import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AwsVpc } from './aws-vpc.entity';

/**
 * Representa uma Subnet sincronizada da Amazon Web Services.
 *
 * Isolamento de tenant:
 * - A Subnet está vinculada à VPC, que pertence à CloudAccount.
 * - A CloudAccount pertence a uma organização.
 * - Sempre filtrar por vpc.cloudAccount.organizationId para garantir isolamento.
 */
@Entity('aws_subnets')
export class AwsSubnet {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**
     * ID da VPC que esta Subnet pertence.
     */
    @Column({ type: 'uuid', name: 'vpc_id' })
    vpcId!: string;

    /**
     * Subnet ID na AWS (ex: subnet-0a1b2c3d4e5f67890).
     */
    @Column({ type: 'varchar', length: 50, name: 'aws_subnet_id', unique: true })
    awsSubnetId!: string;

    /**
     * VPC ID na AWS (denormalizado para facilitar queries).
     */
    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id' })
    awsVpcId!: string;

    /**
     * Bloco CIDR da Subnet (ex: 10.0.1.0/24).
     */
    @Column({ type: 'varchar', length: 50, name: 'cidr_block' })
    cidrBlock!: string;

    /**
     * Zona de disponibilidade (ex: us-east-1a).
     */
    @Column({ type: 'varchar', length: 50, name: 'availability_zone' })
    availabilityZone!: string;

    /**
     * Quantidade de IPs disponíveis na subnet.
     */
    @Column({ type: 'integer', name: 'available_ip_address_count', default: 0 })
    availableIpAddressCount!: number;

    /**
     * Estado da Subnet (available, pending).
     */
    @Column({ type: 'varchar', length: 20, name: 'state' })
    state!: string;

    /**
     * Indicador se é a subnet padrão para a AZ.
     */
    @Column({ type: 'boolean', name: 'is_default_for_az', default: false })
    isDefaultForAz!: boolean;

    /**
     * Indicador se IPs públicos são mapeados automaticamente.
     */
    @Column({ type: 'boolean', name: 'map_public_ip_on_launch', default: false })
    mapPublicIpOnLaunch!: boolean;

    /**
     * Tipo da subnet baseado na route table associada:
     * - public: subnet com rota para Internet Gateway
     * - private_with_nat: subnet privada com rota para NAT Gateway
     * - private_isolated: subnet privada sem acesso à internet
     */
    @Column({
        type: 'varchar',
        length: 20,
        name: 'subnet_type',
        default: 'private_isolated',
    })
    subnetType!: 'public' | 'private_with_nat' | 'private_isolated';

    /**
     * Tags da Subnet em JSON (ex: {"Name": "prod-private-a", "Tier": "private"}).
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

    @ManyToOne(() => AwsVpc, (vpc) => vpc.subnets, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'vpc_id' })
    vpc!: AwsVpc;
}
