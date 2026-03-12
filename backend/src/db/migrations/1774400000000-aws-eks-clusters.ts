import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsEksClusters1774400000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_eks_clusters',
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
                        name: 'cluster_arn',
                        type: 'varchar',
                        length: '512',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'cluster_name',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                    },
                    {
                        name: 'status',
                        type: 'varchar',
                        length: '30',
                        isNullable: false,
                    },
                    {
                        name: 'version',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'endpoint',
                        type: 'varchar',
                        length: '1024',
                        isNullable: true,
                    },
                    {
                        name: 'role_arn',
                        type: 'varchar',
                        length: '2048',
                        isNullable: true,
                    },
                    {
                        name: 'iam_role_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'aws_vpc_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'vpc_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'aws_security_group_ids',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'security_group_ids',
                        type: 'uuid',
                        isArray: true,
                        isNullable: true,
                    },
                    {
                        name: 'ec2_instance_ids',
                        type: 'uuid',
                        isArray: true,
                        isNullable: true,
                    },
                    {
                        name: 'endpoint_public_access',
                        type: 'boolean',
                        default: true,
                    },
                    {
                        name: 'endpoint_private_access',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'public_access_cidrs',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'platform_version',
                        type: 'varchar',
                        length: '30',
                        isNullable: true,
                    },
                    {
                        name: 'logging',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'created_at_aws',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'tags',
                        type: 'jsonb',
                        default: "'{}'",
                    },
                    {
                        name: 'last_synced_at',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamptz',
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamptz',
                        default: 'CURRENT_TIMESTAMP',
                    },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'aws_eks_clusters',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'aws_eks_clusters',
            new TableForeignKey({
                columnNames: ['vpc_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_vpcs',
                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createForeignKey(
            'aws_eks_clusters',
            new TableForeignKey({
                columnNames: ['iam_role_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_iam_roles',
                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createIndex(
            'aws_eks_clusters',
            new TableIndex({
                name: 'idx_aws_eks_clusters_cloud_account_id',
                columnNames: ['cloud_account_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_eks_clusters',
            new TableIndex({
                name: 'idx_aws_eks_clusters_cluster_name',
                columnNames: ['cluster_name'],
            })
        );

        await queryRunner.createIndex(
            'aws_eks_clusters',
            new TableIndex({
                name: 'idx_aws_eks_clusters_vpc_id',
                columnNames: ['vpc_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_eks_clusters',
            new TableIndex({
                name: 'idx_aws_eks_clusters_iam_role_id',
                columnNames: ['iam_role_id'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_eks_clusters');
    }
}
