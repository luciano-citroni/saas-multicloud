import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiFinopsProviderUsers1781800000000 implements MigrationInterface {
    name = 'AiFinopsProviderUsers1781800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_provider_users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "connection_id" uuid,
                "provider" character varying(64) NOT NULL,
                "external_id" character varying(255) NOT NULL,
                "email" character varying(255),
                "name" character varying(255),
                "role" character varying(64),
                "metadata" jsonb NOT NULL DEFAULT '{}',
                "synced_at" TIMESTAMPTZ,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ai_finops_provider_users" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_ai_finops_provider_users_tenant_provider_external" UNIQUE ("tenant_id", "provider", "external_id"),
                CONSTRAINT "FK_ai_finops_provider_users_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_provider_users_connection" FOREIGN KEY ("connection_id") REFERENCES "ai_finops_connections"("id") ON DELETE SET NULL
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_finops_provider_users_lookup"
            ON "ai_finops_provider_users" ("tenant_id", "provider", "external_id")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_finops_provider_users_connection"
            ON "ai_finops_provider_users" ("connection_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_finops_provider_users_connection"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_finops_provider_users_lookup"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_provider_users"`);
    }
}
