import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Amplia deviation_percentage de DECIMAL(8,4) → DECIMAL(12,4).
 *
 * Com médias diárias muito baixas (ex.: CloudFront fracionário), o desvio
 * percentual pode ultrapassar 9999.9999 e causar "numeric field overflow"
 * durante o sync FinOps na fase de detecção de anomalias.
 */
export class FinopsAnomalyDeviationPrecision1778500000000 implements MigrationInterface {
    name = 'FinopsAnomalyDeviationPrecision1778500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_cost_anomalies"
            ALTER COLUMN "deviation_percentage" TYPE DECIMAL(12,4)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Clamp antes de reduzir precisão para evitar overflow no revert
        await queryRunner.query(`
            UPDATE "finops_cost_anomalies"
            SET "deviation_percentage" = LEAST(GREATEST("deviation_percentage", -9999.9999), 9999.9999)
            WHERE "deviation_percentage" > 9999.9999
               OR "deviation_percentage" < -9999.9999
        `);
        await queryRunner.query(`
            ALTER TABLE "finops_cost_anomalies"
            ALTER COLUMN "deviation_percentage" TYPE DECIMAL(8,4)
        `);
    }
}
