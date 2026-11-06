import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsCreditGrantServices1780100000000 implements MigrationInterface {
    name = 'FinopsCreditGrantServices1780100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_credit_grants"
            ADD COLUMN IF NOT EXISTS "services" jsonb NOT NULL DEFAULT '[]'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_credit_grants"
            DROP COLUMN IF EXISTS "services"
        `);
    }
}
