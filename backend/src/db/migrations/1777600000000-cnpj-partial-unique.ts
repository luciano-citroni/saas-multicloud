import { MigrationInterface, QueryRunner } from 'typeorm';

export class CnpjPartialUnique1777600000000 implements MigrationInterface {
    name = 'CnpjPartialUnique1777600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the plain unique constraint if it still exists (pre-AddIamRoleForeignKeys envs)
        await queryRunner.query(`
            ALTER TABLE "organizations"
            DROP CONSTRAINT IF EXISTS "UQ_organizations_cnpj"
        `);

        // Partial unique index: CNPJ must be unique only when it is provided
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_organizations_cnpj_not_null"
            ON "organizations" ("cnpj")
            WHERE cnpj IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_organizations_cnpj_not_null"`);
    }
}
