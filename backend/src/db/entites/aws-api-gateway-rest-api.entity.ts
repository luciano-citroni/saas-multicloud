import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

import { AwsVpc } from './aws-vpc.entity';

/**


 * Representa uma REST API do API Gateway sincronizada da Amazon Web Services.


 */

@Entity('aws_api_gateway_rest_apis')
export class AwsApiGatewayRestApi {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ID da API na AWS. */

    @Column({ type: 'varchar', length: 255, name: 'aws_api_id', unique: true })
    awsApiId!: string;

    /** Nome da API. */

    @Column({ type: 'varchar', length: 255, name: 'name' })
    name!: string;

    /** Descrição da API. */

    @Column({ type: 'varchar', length: 1024, name: 'description', nullable: true })
    description!: string | null;

    /** Tipo de endpoint (REGIONAL, EDGE, PRIVATE). */

    @Column({ type: 'varchar', length: 20, name: 'endpoint_type', nullable: true })
    endpointType!: string | null;

    /** Versão da API. */

    @Column({ type: 'varchar', length: 50, name: 'version', nullable: true })
    version!: string | null;

    /** URL de invocação base. */

    @Column({ type: 'varchar', length: 2048, name: 'invoke_url', nullable: true })
    invokeUrl!: string | null;

    /** ID da VPC na AWS (para APIs privadas). */

    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id', nullable: true })
    awsVpcId!: string | null;

    /** ID da VPC no banco de dados. */

    @Column({ type: 'uuid', name: 'vpc_id', nullable: true })
    vpcId!: string | null;

    /** IDs dos VPC endpoint (para APIs privadas). */

    @Column({ type: 'jsonb', name: 'vpc_endpoint_ids', nullable: true })
    vpcEndpointIds!: string[] | null;

    /** Data de criação na AWS. */

    @Column({ type: 'timestamp', name: 'created_at_aws', nullable: true })
    createdAtAws!: Date | null;

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
