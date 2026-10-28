import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutomationTemplates1778700000000 implements MigrationInterface {
    name = 'AutomationTemplates1778700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "automations"
                ADD COLUMN IF NOT EXISTS "variables" jsonb NOT NULL DEFAULT '{}',
                ADD COLUMN IF NOT EXISTS "pending_plan" jsonb NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "automation_execution"
                ADD COLUMN IF NOT EXISTS "client_request_id" varchar(80) NULL,
                ADD COLUMN IF NOT EXISTS "inventory_sync_status" varchar(20) NOT NULL DEFAULT 'NOT_APPLICABLE'
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "uq_automation_execution_client_request"
                ON "automation_execution" ("automation_id", "client_request_id")
                WHERE "client_request_id" IS NOT NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "automation_execution_nodes"
                ADD COLUMN IF NOT EXISTS "aws_operation_id" varchar(512) NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "provisioned_resource"
                ADD COLUMN IF NOT EXISTS "arn" varchar(1024) NULL,
                ADD COLUMN IF NOT EXISTS "stack_id" varchar(512) NULL,
                ADD COLUMN IF NOT EXISTS "inventory_sync_status" varchar(20) NOT NULL DEFAULT 'NOT_APPLICABLE'
        `);

        await queryRunner.query(`
            ALTER TABLE "provisioned_resource"
                ALTER COLUMN "resource_type" TYPE varchar(128),
                ALTER COLUMN "aws_resource_id" TYPE varchar(1024)
        `);

        await queryRunner.query(`
            CREATE TABLE "automation_templates" (
                "id"              uuid         NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id"       uuid         NULL,
                "name"            varchar(255) NOT NULL,
                "description"     text         NULL,
                "cloud_provider"  varchar(10)  NOT NULL DEFAULT 'AWS',
                "template_type"   varchar(32)  NOT NULL DEFAULT 'CLOUDFORMATION',
                "origin"          varchar(20)  NOT NULL DEFAULT 'ORGANIZATION',
                "created_by"      uuid         NULL,
                "created_at"      timestamp    NOT NULL DEFAULT now(),
                "updated_at"      timestamp    NOT NULL DEFAULT now(),
                CONSTRAINT "pk_automation_templates" PRIMARY KEY ("id"),
                CONSTRAINT "fk_automation_templates_tenant"
                    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "idx_automation_templates_tenant" ON "automation_templates" ("tenant_id")`);

        await queryRunner.query(`
            CREATE TABLE "automation_template_versions" (
                "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
                "template_id"   uuid        NOT NULL,
                "version"       integer     NOT NULL,
                "content"       text        NOT NULL,
                "content_hash"  varchar(64) NOT NULL,
                "format"        varchar(10) NOT NULL,
                "parameters"    jsonb       NOT NULL DEFAULT '[]',
                "outputs"       jsonb       NOT NULL DEFAULT '[]',
                "resources"     jsonb       NOT NULL DEFAULT '[]',
                "has_transform" boolean     NOT NULL DEFAULT false,
                "created_by"    uuid        NULL,
                "created_at"    timestamp   NOT NULL DEFAULT now(),
                "updated_at"    timestamp   NOT NULL DEFAULT now(),
                CONSTRAINT "pk_automation_template_versions" PRIMARY KEY ("id"),
                CONSTRAINT "fk_automation_template_versions_template"
                    FOREIGN KEY ("template_id") REFERENCES "automation_templates"("id") ON DELETE CASCADE,
                CONSTRAINT "uq_automation_template_versions"
                    UNIQUE ("template_id", "version")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "automation_audit_events" (
                "id"           uuid        NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id"    uuid        NOT NULL,
                "actor_id"     uuid        NULL,
                "action"       varchar(64) NOT NULL,
                "entity_type"  varchar(64) NOT NULL,
                "entity_id"    uuid        NULL,
                "metadata"     jsonb       NOT NULL DEFAULT '{}',
                "created_at"   timestamp   NOT NULL DEFAULT now(),
                CONSTRAINT "pk_automation_audit_events" PRIMARY KEY ("id"),
                CONSTRAINT "fk_automation_audit_events_tenant"
                    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "idx_automation_audit_events_tenant" ON "automation_audit_events" ("tenant_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "automation_audit_events"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "automation_template_versions"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "automation_templates"`);
        await queryRunner.query(`
            ALTER TABLE "provisioned_resource"
                DROP COLUMN IF EXISTS "arn",
                DROP COLUMN IF EXISTS "stack_id",
                DROP COLUMN IF EXISTS "inventory_sync_status"
        `);
        await queryRunner.query(`ALTER TABLE "automation_execution_nodes" DROP COLUMN IF EXISTS "aws_operation_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "uq_automation_execution_client_request"`);
        await queryRunner.query(`
            ALTER TABLE "automation_execution"
                DROP COLUMN IF EXISTS "client_request_id",
                DROP COLUMN IF EXISTS "inventory_sync_status"
        `);
        await queryRunner.query(`
            ALTER TABLE "automations"
                DROP COLUMN IF EXISTS "variables",
                DROP COLUMN IF EXISTS "pending_plan"
        `);
    }
}
