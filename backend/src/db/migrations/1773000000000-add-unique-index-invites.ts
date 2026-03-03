import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddUniqueIndexInvites1773000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Garante que só haja 1 convite pendente por email e organização
        await queryRunner.createIndex(
            'organization_invites',
            new TableIndex({
                columnNames: ['organization_id', 'email', 'status'],
                isUnique: true,
                where: `"status" = 'PENDING'`,
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex('organization_invites', 'IDX_organization_invites_organization_id_email_status');
    }
}
