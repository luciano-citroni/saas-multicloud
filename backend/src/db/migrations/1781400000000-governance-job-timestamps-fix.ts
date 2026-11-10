import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normalize governance_jobs timestamps to timestamptz and repair completed_at skew.
 *
 * created_at / updated_at were TIMESTAMP written in session TZ America/Sao_Paulo.
 * completed_at was migrated to timestamptz assuming UTC wall-clock writes; rows written
 * as local wall-clock ended up 3h early. Scans finish in seconds, so align completed_at
 * to created_at when the gap is absurd (> 2 minutes).
 */
export class GovernanceJobTimestampsFix1781400000000 implements MigrationInterface {
    name = 'GovernanceJobTimestampsFix1781400000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "governance_jobs"
            ALTER COLUMN "created_at" TYPE TIMESTAMPTZ
            USING "created_at" AT TIME ZONE 'America/Sao_Paulo'
        `);

        await queryRunner.query(`
            ALTER TABLE "governance_jobs"
            ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ
            USING "updated_at" AT TIME ZONE 'America/Sao_Paulo'
        `);

        await queryRunner.query(`
            UPDATE "governance_jobs"
            SET "completed_at" = "created_at" + INTERVAL '2 seconds'
            WHERE "completed_at" IS NOT NULL
              AND ABS(EXTRACT(EPOCH FROM ("completed_at" - "created_at"))) > 120
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "governance_jobs"
            ALTER COLUMN "created_at" TYPE TIMESTAMP
            USING ("created_at" AT TIME ZONE 'America/Sao_Paulo')
        `);

        await queryRunner.query(`
            ALTER TABLE "governance_jobs"
            ALTER COLUMN "updated_at" TYPE TIMESTAMP
            USING ("updated_at" AT TIME ZONE 'America/Sao_Paulo')
        `);
    }
}
