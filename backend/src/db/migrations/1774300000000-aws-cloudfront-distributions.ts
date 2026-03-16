import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsCloudFrontDistributions1774300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_cloudfront_distributions',

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
                        name: 'distribution_id',

                        type: 'varchar',

                        length: '255',

                        isNullable: false,

                        isUnique: true,
                    },

                    {
                        name: 'arn',

                        type: 'varchar',

                        length: '512',

                        isNullable: false,
                    },

                    {
                        name: 'domain_name',

                        type: 'varchar',

                        length: '512',

                        isNullable: false,
                    },

                    {
                        name: 'status',

                        type: 'varchar',

                        length: '50',

                        default: "'InProgress'",
                    },

                    {
                        name: 'enabled',

                        type: 'boolean',

                        default: true,
                    },

                    {
                        name: 'comment',

                        type: 'text',

                        isNullable: true,
                    },

                    {
                        name: 'price_class',

                        type: 'varchar',

                        length: '50',

                        default: "'PriceClass_100'",
                    },

                    {
                        name: 'aliases',

                        type: 'jsonb',

                        isNullable: true,
                    },

                    {
                        name: 's3_bucket_id',

                        type: 'uuid',

                        isNullable: true,
                    },

                    {
                        name: 'origin_domain_name',

                        type: 'varchar',

                        length: '512',

                        isNullable: false,
                    },

                    {
                        name: 'origin_id',

                        type: 'varchar',

                        length: '255',

                        isNullable: false,
                    },

                    {
                        name: 'origin_path',

                        type: 'varchar',

                        length: '512',

                        isNullable: true,
                    },

                    {
                        name: 'origin_access_identity_enabled',

                        type: 'boolean',

                        default: false,
                    },

                    {
                        name: 'default_root_object',

                        type: 'varchar',

                        length: '255',

                        isNullable: true,
                    },

                    {
                        name: 'viewer_protocol_policy',

                        type: 'varchar',

                        length: '50',

                        default: "'redirect-to-https'",
                    },

                    {
                        name: 'compress',

                        type: 'boolean',

                        default: true,
                    },

                    {
                        name: 'min_ttl',

                        type: 'bigint',

                        default: 0,
                    },

                    {
                        name: 'default_ttl',

                        type: 'bigint',

                        default: 86400,
                    },

                    {
                        name: 'max_ttl',

                        type: 'bigint',

                        default: 31536000,
                    },

                    {
                        name: 'ipv6_enabled',

                        type: 'boolean',

                        default: true,
                    },

                    {
                        name: 'has_custom_certificate',

                        type: 'boolean',

                        default: false,
                    },

                    {
                        name: 'certificate_arn',

                        type: 'varchar',

                        length: '512',

                        isNullable: true,
                    },

                    {
                        name: 'minimum_protocol_version',

                        type: 'varchar',

                        length: '50',

                        isNullable: true,
                    },

                    {
                        name: 'logging_enabled',

                        type: 'boolean',

                        default: false,
                    },

                    {
                        name: 'logging_bucket',

                        type: 'varchar',

                        length: '255',

                        isNullable: true,
                    },

                    {
                        name: 'logging_prefix',

                        type: 'varchar',

                        length: '255',

                        isNullable: true,
                    },

                    {
                        name: 'last_modified_time',

                        type: 'timestamp',

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

        // Foreign key para cloud_account_id

        await queryRunner.createForeignKey(
            'aws_cloudfront_distributions',

            new TableForeignKey({
                columnNames: ['cloud_account_id'],

                referencedColumnNames: ['id'],

                referencedTableName: 'cloud_accounts',

                onDelete: 'CASCADE',
            })
        );

        // Foreign key para s3_bucket_id (opcional, pode ser nulo)

        await queryRunner.createForeignKey(
            'aws_cloudfront_distributions',

            new TableForeignKey({
                columnNames: ['s3_bucket_id'],

                referencedColumnNames: ['id'],

                referencedTableName: 'aws_s3_buckets',

                onDelete: 'SET NULL',
            })
        );

        // Índices para performance

        await queryRunner.createIndex(
            'aws_cloudfront_distributions',

            new TableIndex({
                name: 'idx_cloudfront_distributions_cloud_account_id',

                columnNames: ['cloud_account_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_cloudfront_distributions',

            new TableIndex({
                name: 'idx_cloudfront_distributions_distribution_id',

                columnNames: ['distribution_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_cloudfront_distributions',

            new TableIndex({
                name: 'idx_cloudfront_distributions_s3_bucket_id',

                columnNames: ['s3_bucket_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_cloudfront_distributions',

            new TableIndex({
                name: 'idx_cloudfront_distributions_status',

                columnNames: ['status'],
            })
        );

        await queryRunner.createIndex(
            'aws_cloudfront_distributions',

            new TableIndex({
                name: 'idx_cloudfront_distributions_enabled',

                columnNames: ['enabled'],
            })
        );

        await queryRunner.createIndex(
            'aws_cloudfront_distributions',

            new TableIndex({
                name: 'idx_cloudfront_distributions_origin_domain_name',

                columnNames: ['origin_domain_name'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_cloudfront_distributions');
    }
}
