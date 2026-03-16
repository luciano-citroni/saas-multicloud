import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsEcrRepositories1775200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_ecr_repositories',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'repository_arn', type: 'varchar', length: '1024', isNullable: false, isUnique: true },
                    { name: 'repository_name', type: 'varchar', length: '255', isNullable: false },
                    { name: 'repository_uri', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'registry_id', type: 'varchar', length: '50', isNullable: true },
                    { name: 'image_tag_mutability', type: 'varchar', length: '20', isNullable: true },
                    { name: 'scan_on_push', type: 'boolean', default: false },
                    { name: 'encryption_type', type: 'varchar', length: '10', isNullable: true },
                    { name: 'encryption_kms_key', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'created_at_aws', type: 'timestamptz', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'aws_ecr_repositories',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'aws_ecr_repositories',
            new TableIndex({ name: 'idx_aws_ecr_repositories_cloud_account_id', columnNames: ['cloud_account_id'] })
        );
        await queryRunner.createIndex(
            'aws_ecr_repositories',
            new TableIndex({ name: 'idx_aws_ecr_repositories_repository_name', columnNames: ['repository_name'] })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_ecr_repositories');
    }
}
