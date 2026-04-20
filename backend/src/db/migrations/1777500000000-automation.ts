import { MigrationInterface, QueryRunner } from 'typeorm';

export class Automation1777500000000 implements MigrationInterface {
    name = 'Automation1777500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── automation_execution ─────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "automation_execution" (
                "id"                    uuid        NOT NULL DEFAULT gen_random_uuid(),
                "organization_id"       uuid        NOT NULL,
                "cloud_account_id"      uuid        NOT NULL,
                "pricing_model"         varchar(20) NOT NULL DEFAULT 'ON_DEMAND',
                "total_estimated_cost"  numeric(10,4) NOT NULL DEFAULT 0,
                "status"                varchar(20) NOT NULL DEFAULT 'PENDING',
                "flow_definition"       jsonb       NOT NULL DEFAULT '{}',
                "error_message"         text        NULL,
                "duration_ms"           integer     NULL,
                "created_at"            timestamp   NOT NULL DEFAULT now(),
                "updated_at"            timestamp   NOT NULL DEFAULT now(),
                CONSTRAINT "pk_automation_execution" PRIMARY KEY ("id"),
                CONSTRAINT "fk_automation_execution_org"
                    FOREIGN KEY ("organization_id")
                    REFERENCES "organizations"("id")
                    ON DELETE CASCADE,
                CONSTRAINT "fk_automation_execution_cloud_account"
                    FOREIGN KEY ("cloud_account_id")
                    REFERENCES "cloud_accounts"("id")
                    ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_automation_execution_org"
                ON "automation_execution" ("organization_id")
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_automation_execution_status"
                ON "automation_execution" ("status")
        `);

        // ── provisioned_resource ─────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "provisioned_resource" (
                "id"                uuid        NOT NULL DEFAULT gen_random_uuid(),
                "execution_id"      uuid        NOT NULL,
                "resource_type"     varchar(50) NOT NULL,
                "aws_resource_id"   varchar(255) NULL,
                "region"            varchar(50) NOT NULL,
                "config"            jsonb       NOT NULL DEFAULT '{}',
                "estimated_cost"    numeric(10,4) NOT NULL DEFAULT 0,
                "pricing_model"     varchar(20) NOT NULL DEFAULT 'ON_DEMAND',
                "status"            varchar(20) NOT NULL DEFAULT 'PENDING',
                "error_message"     text        NULL,
                "created_at"        timestamp   NOT NULL DEFAULT now(),
                CONSTRAINT "pk_provisioned_resource" PRIMARY KEY ("id"),
                CONSTRAINT "fk_provisioned_resource_execution"
                    FOREIGN KEY ("execution_id")
                    REFERENCES "automation_execution"("id")
                    ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_provisioned_resource_execution"
                ON "provisioned_resource" ("execution_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "provisioned_resource"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "automation_execution"`);
    }
}
