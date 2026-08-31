import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutomationWorkflows1778400000000 implements MigrationInterface {
    name = 'AutomationWorkflows1778400000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "automations" (
                "id"                uuid        NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id"         uuid        NOT NULL,
                "cloud_account_id"  uuid        NOT NULL,
                "name"              varchar(255) NOT NULL,
                "description"       text        NULL,
                "cloud_provider"    varchar(10) NOT NULL DEFAULT 'AWS',
                "status"            varchar(20) NOT NULL DEFAULT 'DRAFT',
                "version"           integer     NOT NULL DEFAULT 0,
                "created_by"        uuid        NULL,
                "updated_by"        uuid        NULL,
                "created_at"        timestamp   NOT NULL DEFAULT now(),
                "updated_at"        timestamp   NOT NULL DEFAULT now(),
                CONSTRAINT "pk_automations" PRIMARY KEY ("id"),
                CONSTRAINT "fk_automations_tenant"
                    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_automations_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "idx_automations_tenant" ON "automations" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "idx_automations_status" ON "automations" ("status")`);

        await queryRunner.query(`
            CREATE TABLE "automation_nodes" (
                "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
                "automation_id" uuid        NOT NULL,
                "type"          varchar(100) NOT NULL,
                "name"          varchar(255) NOT NULL,
                "config"        jsonb       NOT NULL DEFAULT '{}',
                "position"      jsonb       NULL,
                "created_at"    timestamp   NOT NULL DEFAULT now(),
                "updated_at"    timestamp   NOT NULL DEFAULT now(),
                CONSTRAINT "pk_automation_nodes" PRIMARY KEY ("id"),
                CONSTRAINT "fk_automation_nodes_automation"
                    FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "idx_automation_nodes_automation" ON "automation_nodes" ("automation_id")`);

        await queryRunner.query(`
            CREATE TABLE "automation_edges" (
                "id"              uuid        NOT NULL DEFAULT gen_random_uuid(),
                "automation_id"   uuid        NOT NULL,
                "source_node_id"  uuid        NOT NULL,
                "target_node_id"  uuid        NOT NULL,
                "created_at"      timestamp   NOT NULL DEFAULT now(),
                CONSTRAINT "pk_automation_edges" PRIMARY KEY ("id"),
                CONSTRAINT "fk_automation_edges_automation"
                    FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_automation_edges_source"
                    FOREIGN KEY ("source_node_id") REFERENCES "automation_nodes"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_automation_edges_target"
                    FOREIGN KEY ("target_node_id") REFERENCES "automation_nodes"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "idx_automation_edges_automation" ON "automation_edges" ("automation_id")`);

        await queryRunner.query(`
            CREATE TABLE "automation_versions" (
                "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
                "automation_id" uuid        NOT NULL,
                "version"       integer     NOT NULL,
                "snapshot"      jsonb       NOT NULL,
                "published_by"  uuid        NULL,
                "published_at"  timestamp   NOT NULL DEFAULT now(),
                CONSTRAINT "pk_automation_versions" PRIMARY KEY ("id"),
                CONSTRAINT "fk_automation_versions_automation"
                    FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE,
                CONSTRAINT "uq_automation_versions_automation_version"
                    UNIQUE ("automation_id", "version")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "automation_execution_nodes" (
                "id"           uuid        NOT NULL DEFAULT gen_random_uuid(),
                "execution_id" uuid        NOT NULL,
                "node_id"      uuid        NOT NULL,
                "status"       varchar(20) NOT NULL DEFAULT 'PENDING',
                "started_at"   timestamp   NULL,
                "finished_at"  timestamp   NULL,
                "input"        jsonb       NULL,
                "output"       jsonb       NULL,
                "error"        text        NULL,
                "resource_id"  varchar(512) NULL,
                CONSTRAINT "pk_automation_execution_nodes" PRIMARY KEY ("id"),
                CONSTRAINT "fk_automation_execution_nodes_execution"
                    FOREIGN KEY ("execution_id") REFERENCES "automation_execution"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "idx_automation_execution_nodes_execution" ON "automation_execution_nodes" ("execution_id")`);

        await queryRunner.query(`
            ALTER TABLE "automation_execution"
                ADD COLUMN IF NOT EXISTS "automation_id" uuid NULL,
                ADD COLUMN IF NOT EXISTS "automation_version" integer NULL,
                ADD COLUMN IF NOT EXISTS "triggered_by" uuid NULL,
                ADD COLUMN IF NOT EXISTS "started_at" timestamp NULL,
                ADD COLUMN IF NOT EXISTS "finished_at" timestamp NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "automation_execution"
                ALTER COLUMN "pricing_model" DROP NOT NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "automation_execution"
                ADD CONSTRAINT "fk_automation_execution_automation"
                    FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE SET NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "automation_execution"
                DROP CONSTRAINT IF EXISTS "fk_automation_execution_automation"
        `);

        await queryRunner.query(`
            ALTER TABLE "automation_execution"
                DROP COLUMN IF EXISTS "automation_id",
                DROP COLUMN IF EXISTS "automation_version",
                DROP COLUMN IF EXISTS "triggered_by",
                DROP COLUMN IF EXISTS "started_at",
                DROP COLUMN IF EXISTS "finished_at"
        `);

        await queryRunner.query(`ALTER TABLE "automation_execution" ALTER COLUMN "pricing_model" SET NOT NULL`);

        await queryRunner.query(`DROP TABLE IF EXISTS "automation_execution_nodes"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "automation_versions"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "automation_edges"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "automation_nodes"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "automations"`);
    }
}
