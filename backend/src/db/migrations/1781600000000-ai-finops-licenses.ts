import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiFinopsLicenses1781600000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_licenses" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "provider" character varying(64) NOT NULL,
                "license_type" character varying(32) NOT NULL,
                "name" character varying(255) NOT NULL,
                "quantity" decimal(18,4) NOT NULL DEFAULT 0,
                "unit_cost" decimal(18,6) NOT NULL DEFAULT 0,
                "currency" character varying(10) NOT NULL DEFAULT 'USD',
                "starts_at" TIMESTAMPTZ,
                "ends_at" TIMESTAMPTZ,
                "source" character varying(64) NOT NULL DEFAULT 'manual',
                "remaining_quantity" decimal(18,4),
                "metadata" jsonb NOT NULL DEFAULT '{}',
                "status" character varying(32) NOT NULL DEFAULT 'active',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_licenses_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_licenses_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_ai_finops_licenses_tenant_org" ON "ai_finops_licenses" ("tenant_id", "organization_id")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_ai_finops_licenses_provider" ON "ai_finops_licenses" ("provider")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_licenses"`);
    }
}
