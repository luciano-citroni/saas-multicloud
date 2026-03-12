import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

/**
 * Representa uma tabela DynamoDB sincronizada da Amazon Web Services.
 */
@Entity('aws_dynamodb_tables')
export class AwsDynamoDbTable {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ARN da tabela DynamoDB na AWS. */
    @Column({ type: 'varchar', length: 1024, name: 'table_arn', unique: true })
    tableArn!: string;

    /** ID da tabela na AWS. */
    @Column({ type: 'varchar', length: 255, name: 'table_id', nullable: true })
    tableId!: string | null;

    /** Nome da tabela. */
    @Column({ type: 'varchar', length: 255, name: 'table_name' })
    tableName!: string;

    /** Status da tabela (ACTIVE, CREATING, DELETING, UPDATING, INACCESSIBLE_ENCRYPTION_CREDENTIALS, ARCHIVING, ARCHIVED). */
    @Column({ type: 'varchar', length: 50, name: 'table_status', nullable: true })
    tableStatus!: string | null;

    /** Modo de cobrança (PROVISIONED, PAY_PER_REQUEST). */
    @Column({ type: 'varchar', length: 30, name: 'billing_mode', nullable: true })
    billingMode!: string | null;

    /** Número de itens na tabela. */
    @Column({ type: 'bigint', name: 'item_count', nullable: true })
    itemCount!: number | null;

    /** Tamanho da tabela em bytes. */
    @Column({ type: 'bigint', name: 'table_size_bytes', nullable: true })
    tableSizeBytes!: number | null;

    /** Throughput de leitura provisionado. */
    @Column({ type: 'int', name: 'read_capacity_units', nullable: true })
    readCapacityUnits!: number | null;

    /** Throughput de escrita provisionado. */
    @Column({ type: 'int', name: 'write_capacity_units', nullable: true })
    writeCapacityUnits!: number | null;

    /** Tipo de criptografia SSE (AES256, KMS). */
    @Column({ type: 'varchar', length: 10, name: 'sse_type', nullable: true })
    sseType!: string | null;

    /** ARN da chave KMS para SSE. */
    @Column({ type: 'varchar', length: 1024, name: 'sse_kms_master_key_arn', nullable: true })
    ssKmsMasterKeyArn!: string | null;

    /** Indica se Point-in-Time Recovery está habilitado. */
    @Column({ type: 'boolean', name: 'point_in_time_recovery_enabled', nullable: true })
    pointInTimeRecoveryEnabled!: boolean | null;

    /** Índices globais secundários em JSON. */
    @Column({ type: 'jsonb', name: 'global_secondary_indexes', nullable: true })
    globalSecondaryIndexes!: Record<string, any>[] | null;

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
}
