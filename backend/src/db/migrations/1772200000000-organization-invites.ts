import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class OrganizationInvites1772200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'organization_invites',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'gen_random_uuid()',
                    },
                    {
                        name: 'organization_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'email',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                    },
                    {
                        name: 'role',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'token',
                        type: 'uuid',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'status',
                        type: 'varchar',
                        length: '20',
                        isNullable: false,
                        default: "'PENDING'",
                    },
                    {
                        name: 'invited_by_user_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'expires_at',
                        type: 'timestamp',
                        isNullable: false,
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
            }),
            true
        );

        await queryRunner.createForeignKey(
            'organization_invites',
            new TableForeignKey({
                columnNames: ['organization_id'],
                referencedTableName: 'organizations',
                referencedColumnNames: ['id'],
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'organization_invites',
            new TableForeignKey({
                columnNames: ['invited_by_user_id'],
                referencedTableName: 'users',
                referencedColumnNames: ['id'],
                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createIndex(
            'organization_invites',
            new TableIndex({
                columnNames: ['organization_id'],
            })
        );

        await queryRunner.createIndex(
            'organization_invites',
            new TableIndex({
                columnNames: ['email'],
            })
        );

        await queryRunner.createIndex(
            'organization_invites',
            new TableIndex({
                columnNames: ['token'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('organization_invites');
    }
}
