import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AwsVpc } from './aws-vpc.entity';
import { AwsSubnet } from './aws-subnet.entity';

/**
 * Estados possíveis de uma instância EC2.
 */
export enum Ec2InstanceState {
    PENDING = 'pending',
    RUNNING = 'running',
    SHUTTING_DOWN = 'shutting-down',
    STOPPED = 'stopped',
    STOPPING = 'stopping',
    TERMINATED = 'terminated',
}

/**
 * Representa uma instância EC2 sincronizada da Amazon Web Services.
 *
 * Isolamento de tenant:
 * - A instância está vinculada à Subnet, que pertence à VPC.
 * - A VPC pertence à CloudAccount, que pertence a uma organização.
 * - Sempre filtrar por vpc.cloudAccount.organizationId para garantir isolamento.
 */
@Entity('aws_ec2_instances')
export class AwsEc2Instance {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**
     * ID da Subnet onde a instância está rodando.
     */
    @Column({ type: 'uuid', name: 'subnet_id' })
    subnetId!: string;

    /**
     * ID da VPC (denormalizado para facilitar queries).
     */
    @Column({ type: 'uuid', name: 'vpc_id' })
    vpcId!: string;

    /**
     * Instance ID na AWS (ex: i-0a1b2c3d4e5f67890).
     */
    @Column({ type: 'varchar', length: 50, name: 'aws_instance_id', unique: true })
    awsInstanceId!: string;

    /**
     * SubnetId na AWS (denormalizado).
     */
    @Column({ type: 'varchar', length: 50, name: 'aws_subnet_id' })
    awsSubnetId!: string;

    /**
     * VPC ID na AWS (denormalizado).
     */
    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id' })
    awsVpcId!: string;

    /**
     * Tipo de instância (ex: t2.micro, t3.small, m5.large).
     */
    @Column({ type: 'varchar', length: 50, name: 'instance_type' })
    instanceType!: string;

    /**
     * Estado da instância (pending, running, stopped, terminated, etc).
     */
    @Column({ type: 'varchar', length: 20 })
    state!: string;

    /**
     * Razão pela qual a instância entrou neste estado (se aplicável).
     */
    @Column({ type: 'varchar', length: 255, name: 'state_reason', nullable: true })
    stateReason!: string | null;

    /**
     * Nome da AMI (Amazon Machine Image) usada.
     */
    @Column({ type: 'varchar', length: 100, name: 'image_id', nullable: true })
    imageId!: string | null;

    /**
     * Endereço IP privado da instância.
     */
    @Column({ type: 'varchar', length: 15, name: 'private_ip_address', nullable: true })
    privateIpAddress!: string | null;

    /**
     * Endereço IP público da instância (se associado).
     */
    @Column({ type: 'varchar', length: 15, name: 'public_ip_address', nullable: true })
    publicIpAddress!: string | null;

    /**
     * Elastic IP associado (se houver).
     */
    @Column({ type: 'varchar', length: 20, name: 'elastic_ip', nullable: true })
    elasticIp!: string | null;

    /**
     * ID da chave-par (key pair) usada para SSH.
     */
    @Column({ type: 'varchar', length: 100, name: 'key_name', nullable: true })
    keyName!: string | null;

    /**
     * ID do security group principal.
     */
    @Column({ type: 'varchar', length: 50, name: 'security_group_id', nullable: true })
    securityGroupId!: string | null;

    /**
     * Zona de disponibilidade onde a instância está rodando.
     */
    @Column({ type: 'varchar', length: 50, name: 'availability_zone', nullable: true })
    availabilityZone!: string | null;

    /**
     * Tempo de lançamento (launch time).
     */
    @Column({ type: 'timestamp', name: 'launch_time', nullable: true })
    launchTime!: Date | null;

    /**
     * Tags da instância em JSON (ex: {"Name": "web-server-01", "Environment": "production"}).
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

    @ManyToOne(() => AwsSubnet, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'subnet_id' })
    subnet!: AwsSubnet;

    @ManyToOne(() => AwsVpc, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'vpc_id' })
    vpc!: AwsVpc;
}
