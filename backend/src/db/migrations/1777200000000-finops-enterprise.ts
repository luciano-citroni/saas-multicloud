import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsEnterprise1777200000000 implements MigrationInterface {
    name = 'FinopsEnterprise1777200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── 1. Evolve finops_cost_records ─────────────────────────────────────

        // Add new columns with defaults (backward compatible)
        await queryRunner.query(`
            ALTER TABLE finops_cost_records
                ADD COLUMN IF NOT EXISTS resource_id VARCHAR(512) NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS usage_type VARCHAR(255) NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS operation VARCHAR(255) NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS usage_quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS usage_unit VARCHAR(50) NOT NULL DEFAULT '';
        `);

        // Drop old unique constraint (service + region + date + granularity)
        await queryRunner.query(`
            ALTER TABLE finops_cost_records
                DROP CONSTRAINT IF EXISTS uq_finops_cost_records_account_service_region_date_gran;
        `);

        // Create new unique constraint including resource_id for precise dedup
        await queryRunner.query(`
            ALTER TABLE finops_cost_records
                ADD CONSTRAINT uq_finops_cost_records_v2
                UNIQUE (cloud_account_id, service, resource_id, region, date, granularity);
        `);

        // Additional index for service + date queries
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_finops_cost_records_org_account_service_date
                ON finops_cost_records (organization_id, cloud_account_id, service, date);
        `);

        // ── 2. Create finops_cost_aggregates ──────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS finops_cost_aggregates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id UUID NOT NULL,
                cloud_account_id UUID NOT NULL,
                cloud_provider VARCHAR(20) NOT NULL,
                service VARCHAR(255) NOT NULL,
                region VARCHAR(100) NOT NULL DEFAULT '',
                tag_key VARCHAR(100) NOT NULL DEFAULT '',
                tag_value VARCHAR(512) NOT NULL DEFAULT '',
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
                total_cost DECIMAL(18,6) NOT NULL DEFAULT 0,
                avg_daily_cost DECIMAL(18,6) NOT NULL DEFAULT 0,
                record_count INTEGER NOT NULL DEFAULT 0,
                currency VARCHAR(10) NOT NULL DEFAULT 'USD',
                created_at TIMESTAMP NOT NULL DEFAULT now(),
                updated_at TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT fk_finops_aggregates_cloud_account
                    FOREIGN KEY (cloud_account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
                CONSTRAINT uq_finops_aggregates
                    UNIQUE (organization_id, cloud_account_id, cloud_provider, service, region, tag_key, tag_value, period_start, period_end, period_type)
            );
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_finops_aggregates_org_account_period
                ON finops_cost_aggregates (organization_id, cloud_account_id, period_start, period_end);
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_finops_aggregates_org_service_period
                ON finops_cost_aggregates (organization_id, service, period_start);
        `);

        // ── 3. Create finops_cost_sync_runs ───────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS finops_cost_sync_runs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id UUID NOT NULL,
                cloud_account_id UUID NOT NULL,
                cloud_provider VARCHAR(20) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'running',
                records_upserted INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                completed_at TIMESTAMP,
                trigger_type VARCHAR(30) NOT NULL DEFAULT 'manual',
                created_at TIMESTAMP NOT NULL DEFAULT now(),
                updated_at TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT fk_finops_sync_runs_cloud_account
                    FOREIGN KEY (cloud_account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE
            );
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_finops_sync_runs_org_account
                ON finops_cost_sync_runs (organization_id, cloud_account_id);
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_finops_sync_runs_status
                ON finops_cost_sync_runs (organization_id, status);
        `);

        // ── 4. Create finops_cost_anomalies ───────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS finops_cost_anomalies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id UUID NOT NULL,
                cloud_account_id UUID NOT NULL,
                cloud_provider VARCHAR(20) NOT NULL,
                service VARCHAR(255) NOT NULL,
                region VARCHAR(100) NOT NULL DEFAULT '',
                anomaly_date DATE NOT NULL,
                expected_cost DECIMAL(18,6) NOT NULL,
                actual_cost DECIMAL(18,6) NOT NULL,
                deviation_percentage DECIMAL(8,4) NOT NULL,
                financial_impact DECIMAL(18,6) NOT NULL,
                severity VARCHAR(20) NOT NULL DEFAULT 'medium',
                status VARCHAR(20) NOT NULL DEFAULT 'open',
                currency VARCHAR(10) NOT NULL DEFAULT 'USD',
                description TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT now(),
                updated_at TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT fk_finops_anomalies_cloud_account
                    FOREIGN KEY (cloud_account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
                CONSTRAINT uq_finops_anomalies
                    UNIQUE (organization_id, cloud_account_id, service, region, anomaly_date)
            );
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_finops_anomalies_org_account_date
                ON finops_cost_anomalies (organization_id, cloud_account_id, anomaly_date);
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_finops_anomalies_status_severity
                ON finops_cost_anomalies (organization_id, status, severity);
        `);

        // ── 5. Create finops_tenant_billing ───────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS finops_tenant_billing (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id UUID NOT NULL,
                cloud_account_id UUID NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                cloud_cost DECIMAL(18,6) NOT NULL DEFAULT 0,
                markup_percentage DECIMAL(8,4) NOT NULL DEFAULT 0,
                markup_amount DECIMAL(18,6) NOT NULL DEFAULT 0,
                final_price DECIMAL(18,6) NOT NULL DEFAULT 0,
                margin DECIMAL(18,6) NOT NULL DEFAULT 0,
                margin_percentage DECIMAL(8,4) NOT NULL DEFAULT 0,
                currency VARCHAR(10) NOT NULL DEFAULT 'USD',
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                chargeback_breakdown JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT now(),
                updated_at TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT fk_finops_billing_cloud_account
                    FOREIGN KEY (cloud_account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
                CONSTRAINT uq_finops_tenant_billing
                    UNIQUE (organization_id, cloud_account_id, period_start, period_end)
            );
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_finops_tenant_billing_org_account_period
                ON finops_tenant_billing (organization_id, cloud_account_id, period_start, period_end);
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_finops_tenant_billing_status
                ON finops_tenant_billing (organization_id, status);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop new tables
        await queryRunner.query(`DROP TABLE IF EXISTS finops_tenant_billing;`);
        await queryRunner.query(`DROP TABLE IF EXISTS finops_cost_anomalies;`);
        await queryRunner.query(`DROP TABLE IF EXISTS finops_cost_sync_runs;`);
        await queryRunner.query(`DROP TABLE IF EXISTS finops_cost_aggregates;`);

        // Revert cost_records changes
        await queryRunner.query(`
            ALTER TABLE finops_cost_records
                DROP CONSTRAINT IF EXISTS uq_finops_cost_records_v2;
        `);

        await queryRunner.query(`
            ALTER TABLE finops_cost_records
                ADD CONSTRAINT uq_finops_cost_records_account_service_region_date_gran
                UNIQUE (cloud_account_id, service, region, date, granularity);
        `);

        await queryRunner.query(`DROP INDEX IF EXISTS idx_finops_cost_records_org_account_service_date;`);

        await queryRunner.query(`
            ALTER TABLE finops_cost_records
                DROP COLUMN IF EXISTS resource_id,
                DROP COLUMN IF EXISTS usage_type,
                DROP COLUMN IF EXISTS operation,
                DROP COLUMN IF EXISTS usage_quantity,
                DROP COLUMN IF EXISTS usage_unit;
        `);
    }
}
