import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A constraint original (conta + serviço + região + data + granularidade) ficou
 * no banco: a migration que deveria removê-la usava outro nome. Com ela ativa,
 * o fechamento não grava vários recursos ou usage types do mesmo serviço.
 */
export class FinopsCostRecordResourceUnique1780700000000 implements MigrationInterface {
    name = 'FinopsCostRecordResourceUnique1780700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE finops_cost_records
                DROP CONSTRAINT IF EXISTS uq_finops_cost_record
        `);
        await queryRunner.query(`
            ALTER TABLE finops_cost_records
                DROP CONSTRAINT IF EXISTS uq_finops_cost_records_account_service_region_date_gran
        `);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'uq_finops_cost_records_v2'
                ) THEN
                    ALTER TABLE finops_cost_records
                        ADD CONSTRAINT uq_finops_cost_records_v2
                        UNIQUE (cloud_account_id, service, resource_id, region, date, granularity);
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'uq_finops_cost_record'
                ) THEN
                    ALTER TABLE finops_cost_records
                        ADD CONSTRAINT uq_finops_cost_record
                        UNIQUE (cloud_account_id, service, region, date, granularity);
                END IF;
            END $$;
        `);
    }
}
