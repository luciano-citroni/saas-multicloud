import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutomationExecutionSecrets1778800000000 implements MigrationInterface {
    name = 'AutomationExecutionSecrets1778800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "automation_execution"
                ADD COLUMN IF NOT EXISTS "parameters_encrypted" text NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "automation_execution"
                DROP COLUMN IF EXISTS "parameters_encrypted"
        `);
    }
}
