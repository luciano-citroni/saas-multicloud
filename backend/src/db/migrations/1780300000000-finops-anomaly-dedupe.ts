import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anomalias são derivadas do custo diário. Linhas com region NULL não
 * conflitam entre si no Postgres, então cada sync inseria outra cópia.
 * Limpamos o derivado e garantimos a chave única com região/serviço vazios.
 */
export class FinopsAnomalyDedupe1780300000000 implements MigrationInterface {
    name = 'FinopsAnomalyDedupe1780300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "finops_cost_anomalies"`);
        await queryRunner.query(`
            ALTER TABLE "finops_cost_anomalies"
            ALTER COLUMN "region" SET DEFAULT '',
            ALTER COLUMN "region" SET NOT NULL,
            ALTER COLUMN "service" SET DEFAULT '',
            ALTER COLUMN "service" SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "finops_cost_anomalies"
            DROP CONSTRAINT IF EXISTS "uq_finops_anomalies"
        `);
        await queryRunner.query(`
            ALTER TABLE "finops_cost_anomalies"
            ADD CONSTRAINT "uq_finops_anomalies"
            UNIQUE ("organization_id", "cloud_account_id", "service", "region", "anomaly_date")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_cost_anomalies"
            DROP CONSTRAINT IF EXISTS "uq_finops_anomalies"
        `);
        await queryRunner.query(`
            ALTER TABLE "finops_cost_anomalies"
            ADD CONSTRAINT "uq_finops_anomalies"
            UNIQUE ("organization_id", "cloud_account_id", "service", "region", "anomaly_date")
        `);
    }
}
