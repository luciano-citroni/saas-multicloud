import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix governance_jobs.completed_at timezone skew.
 *
 * The column was TIMESTAMP WITHOUT TIME ZONE. With DB session timezone
 * America/Sao_Paulo, values written from JS Date (UTC components) were read
 * back as local wall-clock, shifting "Concluído em" by +3h vs created_at.
 */
export class GovernanceJobCompletedAtTimestamptz1781300000000 implements MigrationInterface {
    name = 'GovernanceJobCompletedAtTimestamptz1781300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "governance_jobs"
            ALTER COLUMN "completed_at" TYPE TIMESTAMPTZ
            USING CASE
                WHEN "completed_at" IS NULL THEN NULL
                ELSE "completed_at" AT TIME ZONE 'UTC'
            END
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "governance_jobs"
            ALTER COLUMN "completed_at" TYPE TIMESTAMP
            USING CASE
                WHEN "completed_at" IS NULL THEN NULL
                ELSE ("completed_at" AT TIME ZONE 'UTC')
            END
        `);
    }
}
