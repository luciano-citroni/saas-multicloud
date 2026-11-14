import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiFinopsPolicyScopeIdVarchar1781900000000 implements MigrationInterface {
    name = 'AiFinopsPolicyScopeIdVarchar1781900000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ai_finops_policies"
            ALTER COLUMN "scope_id" TYPE character varying(255)
            USING "scope_id"::text
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ai_finops_policies"
            ALTER COLUMN "scope_id" TYPE uuid
            USING NULLIF("scope_id", '')::uuid
        `);
    }
}
