import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';
import { AwsVpc } from './aws-vpc.entity';

/**
 * Tipos de Load Balancer suportados pela AWS
 */
export enum LoadBalancerType {
    APPLICATION = 'application', // ALB - Application Load Balancer
    NETWORK = 'network', // NLB - Network Load Balancer
    GATEWAY = 'gateway', // GLB - Gateway Load Balancer
    CLASSIC = 'classic', // CLB - Classic Load Balancer (legacy)
}

/**
 * Estados possíveis de um Load Balancer
 */
export enum LoadBalancerState {
    PROVISIONING = 'provisioning',
    ACTIVE = 'active',
    ACTIVE_IMPAIRED = 'active_impaired',
    FAILED = 'failed',
}

/**
 * Esquema de endereçamento IP
 */
export enum IpAddressType {
    IPV4 = 'ipv4',
    DUALSTACK = 'dualstack',
}

/**
 * Representa um Load Balancer sincronizado da Amazon Web Services.
 *
 * Isolamento de tenant:
 * - O Load Balancer está vinculado à CloudAccount, que já pertence a uma organização.
 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.
 */
@Entity('aws_load_balancers')
export class AwsLoadBalancer {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**
     * ID da CloudAccount que este Load Balancer pertence.
     */
    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**
     * ARN do Load Balancer na AWS.
     */
    @Column({ type: 'varchar', length: 255, name: 'aws_load_balancer_arn', unique: true })
    awsLoadBalancerArn!: string;

    /**
     * Nome do Load Balancer.
     */
    @Column({ type: 'varchar', length: 255, name: 'name' })
    name!: string;

    /**
     * DNS name do Load Balancer.
     */
    @Column({ type: 'varchar', length: 500, name: 'dns_name' })
    dnsName!: string;

    /**
     * ID da VPC no banco de dados.
     */
    @Column({ type: 'uuid', name: 'vpc_id', nullable: true })
    vpcId!: string | null;

    /**
     * Tipo do Load Balancer (application, network, gateway, classic).
     */
    @Column({
        type: 'enum',
        enum: LoadBalancerType,
        name: 'type',
    })
    type!: LoadBalancerType;

    /**
     * Estado do Load Balancer.
     */
    @Column({
        type: 'enum',
        enum: LoadBalancerState,
        name: 'state',
    })
    state!: LoadBalancerState;

    /**
     * Esquema do Load Balancer (internet-facing ou internal).
     */
    @Column({ type: 'varchar', length: 50, name: 'scheme' })
    scheme!: string;

    /**
     * Tipo de endereço IP (ipv4 ou dualstack).
     */
    @Column({
        type: 'enum',
        enum: IpAddressType,
        name: 'ip_address_type',
    })
    ipAddressType!: IpAddressType;

    /**
     * IDs das Subnets onde o Load Balancer está disponível (uma por AZ).
     */
    @Column('uuid', { array: true, name: 'subnet_ids', nullable: true })
    subnetIds!: string[] | null;

    /**
     * IDs das Availability Zones onde o Load Balancer está disponível.
     */
    @Column({ type: 'jsonb', name: 'availability_zones', nullable: true })
    availabilityZones!: Record<string, any>[] | null;

    /**
     * IDs dos Security Groups na AWS (denormalizado, apenas para ALB e NLB).
     */
    @Column({ type: 'jsonb', name: 'aws_security_group_ids', nullable: true })
    awsSecurityGroupIds!: string[] | null;

    /**
     * IDs dos Security Groups no banco de dados (FKs para aws_security_groups).
     */
    @Column('uuid', { array: true, name: 'security_group_ids', nullable: true })
    securityGroupIds!: string[] | null;

    /**
     * Data de criação do Load Balancer na AWS.
     */
    @Column({ type: 'timestamp', name: 'created_time', nullable: true })
    createdTime!: Date | null;

    /**
     * Tags do Load Balancer em JSON.
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

    @OneToMany('AwsLoadBalancerListener', 'loadBalancer')
    listeners!: any[];
}
