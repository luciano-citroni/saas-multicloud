import { MigrationInterface, QueryRunner } from 'typeorm';

export class Finops1777000000000 implements MigrationInterface {
    name = 'Finops1777000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── finops_consents ──────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "finops_consents" (
                "id"               uuid                NOT NULL DEFAULT gen_random_uuid(),
                "organization_id"  uuid                NOT NULL,
                "cloud_account_id" uuid                NOT NULL,
                "cloud_provider"   varchar(20)         NOT NULL,
                "accepted"         boolean             NOT NULL DEFAULT false,
                "accepted_at"      timestamp           NULL,
                "version"          varchar(20)         NOT NULL DEFAULT '1.0',
                "created_at"       timestamp           NOT NULL DEFAULT now(),
                "updated_at"       timestamp           NOT NULL DEFAULT now(),
                CONSTRAINT "pk_finops_consents" PRIMARY KEY ("id"),
                CONSTRAINT "fk_finops_consents_cloud_account"
                    FOREIGN KEY ("cloud_account_id")
                    REFERENCES "cloud_accounts"("id")
                    ON DELETE CASCADE,
                CONSTRAINT "uq_finops_consent_account_provider"
                    UNIQUE ("cloud_account_id", "cloud_provider")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_finops_consents_org"
                ON "finops_consents" ("organization_id")
        `);

        // ── finops_jobs ───────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "finops_jobs" (
                "id"                uuid        NOT NULL DEFAULT gen_random_uuid(),
                "organization_id"   uuid        NOT NULL,
                "cloud_account_id"  uuid        NOT NULL,
                "cloud_provider"    varchar(20) NOT NULL,
                "status"            varchar(20) NOT NULL DEFAULT 'pending',
                "granularity"       varchar(10) NOT NULL,
                "period_start"      date        NOT NULL,
                "period_end"        date        NOT NULL,
                "records_collected" integer     NULL,
                "error"             text        NULL,
                "completed_at"      timestamp   NULL,
                "created_at"        timestamp   NOT NULL DEFAULT now(),
                "updated_at"        timestamp   NOT NULL DEFAULT now(),
                CONSTRAINT "pk_finops_jobs" PRIMARY KEY ("id"),
                CONSTRAINT "fk_finops_jobs_cloud_account"
                    FOREIGN KEY ("cloud_account_id")
                    REFERENCES "cloud_accounts"("id")
                    ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_finops_jobs_org_account"
                ON "finops_jobs" ("organization_id", "cloud_account_id")
        `);

        // ── finops_cost_records ───────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "finops_cost_records" (
                "id"               uuid           NOT NULL DEFAULT gen_random_uuid(),
                "organization_id"  uuid           NOT NULL,
                "cloud_account_id" uuid           NOT NULL,
                "cloud_provider"   varchar(20)    NOT NULL,
                "service"          varchar(255)   NOT NULL,
                "region"           varchar(100)   NULL,
                "cost"             decimal(18,6)  NOT NULL,
                "currency"         varchar(10)    NOT NULL DEFAULT 'USD',
                "date"             date           NOT NULL,
                "granularity"      varchar(10)    NOT NULL,
                "tags"             jsonb          NULL,
                "created_at"       timestamp      NOT NULL DEFAULT now(),
                "updated_at"       timestamp      NOT NULL DEFAULT now(),
                CONSTRAINT "pk_finops_cost_records" PRIMARY KEY ("id"),
                CONSTRAINT "fk_finops_cost_records_cloud_account"
                    FOREIGN KEY ("cloud_account_id")
                    REFERENCES "cloud_accounts"("id")
                    ON DELETE CASCADE,
                CONSTRAINT "uq_finops_cost_record"
                    UNIQUE ("cloud_account_id", "service", "region", "date", "granularity")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_finops_cost_records_org_account_date"
                ON "finops_cost_records" ("organization_id", "cloud_account_id", "date")
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_finops_cost_records_date_service"
                ON "finops_cost_records" ("date", "service")
        `);

        // ── finops_budgets ────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "finops_budgets" (
                "id"                uuid          NOT NULL DEFAULT gen_random_uuid(),
                "organization_id"   uuid          NOT NULL,
                "cloud_account_id"  uuid          NOT NULL,
                "name"              varchar(255)  NOT NULL,
                "amount"            decimal(18,2) NOT NULL,
                "currency"          varchar(10)   NOT NULL DEFAULT 'USD',
                "period"            varchar(20)   NOT NULL DEFAULT 'monthly',
                "service"           varchar(255)  NULL,
                "alert_thresholds"  jsonb         NOT NULL DEFAULT '[]',
                "is_active"         boolean       NOT NULL DEFAULT true,
                "created_at"        timestamp     NOT NULL DEFAULT now(),
                "updated_at"        timestamp     NOT NULL DEFAULT now(),
                CONSTRAINT "pk_finops_budgets" PRIMARY KEY ("id"),
                CONSTRAINT "fk_finops_budgets_cloud_account"
                    FOREIGN KEY ("cloud_account_id")
                    REFERENCES "cloud_accounts"("id")
                    ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_finops_budgets_org_account"
                ON "finops_budgets" ("organization_id", "cloud_account_id")
        `);

        // ── finops_recommendations ────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "finops_recommendations" (
                "id"               uuid          NOT NULL DEFAULT gen_random_uuid(),
                "organization_id"  uuid          NOT NULL,
                "cloud_account_id" uuid          NOT NULL,
                "cloud_provider"   varchar(20)   NOT NULL,
                "type"             varchar(100)  NOT NULL,
                "resource_id"      varchar(512)  NOT NULL,
                "resource_type"    varchar(100)  NOT NULL,
                "description"      text          NOT NULL,
                "recommendation"   text          NOT NULL,
                "potential_saving" decimal(18,2) NULL,
                "currency"         varchar(10)   NOT NULL DEFAULT 'USD',
                "priority"         varchar(10)   NOT NULL DEFAULT 'medium',
                "metadata"         jsonb         NULL,
                "status"           varchar(20)   NOT NULL DEFAULT 'open',
                "created_at"       timestamp     NOT NULL DEFAULT now(),
                "updated_at"       timestamp     NOT NULL DEFAULT now(),
                CONSTRAINT "pk_finops_recommendations" PRIMARY KEY ("id"),
                CONSTRAINT "fk_finops_recommendations_cloud_account"
                    FOREIGN KEY ("cloud_account_id")
                    REFERENCES "cloud_accounts"("id")
                    ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_finops_recommendations_org_account"
                ON "finops_recommendations" ("organization_id", "cloud_account_id")
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_finops_recommendations_status"
                ON "finops_recommendations" ("status", "priority")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_recommendations"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_budgets"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_cost_records"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_jobs"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_consents"`);
    }
}
