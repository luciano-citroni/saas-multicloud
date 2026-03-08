import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsS3Buckets1774200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_s3_buckets',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'gen_random_uuid()',
                    },
                    {
                        name: 'cloud_account_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'bucket_name',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'bucket_arn',
                        type: 'varchar',
                        length: '512',
                        isNullable: true,
                    },
                    {
                        name: 'region',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'creation_date',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'versioning_status',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'encryption_enabled',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'encryption_type',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'kms_key_id',
                        type: 'varchar',
                        length: '2048',
                        isNullable: true,
                    },
                    {
                        name: 'public_access_blocked',
                        type: 'boolean',
                        default: true,
                    },
                    {
                        name: 'has_bucket_policy',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'replication_enabled',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'logging_enabled',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'logging_target_bucket',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'website_enabled',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'website_index_document',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'website_error_document',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'lifecycle_rules',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'tags',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'last_synced_at',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'aws_s3_buckets',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'aws_s3_buckets',
            new TableIndex({
                name: 'idx_aws_s3_buckets_cloud_account_id',
                columnNames: ['cloud_account_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_s3_buckets',
            new TableIndex({
                name: 'idx_aws_s3_buckets_bucket_name',
                columnNames: ['bucket_name'],
            })
        );

        await queryRunner.createIndex(
            'aws_s3_buckets',
            new TableIndex({
                name: 'idx_aws_s3_buckets_region',
                columnNames: ['region'],
            })
        );

        await queryRunner.createIndex(
            'aws_s3_buckets',
            new TableIndex({
                name: 'idx_aws_s3_buckets_encryption_enabled',
                columnNames: ['encryption_enabled'],
            })
        );

        await queryRunner.createIndex(
            'aws_s3_buckets',
            new TableIndex({
                name: 'idx_aws_s3_buckets_public_access_blocked',
                columnNames: ['public_access_blocked'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_s3_buckets');
    }
}
