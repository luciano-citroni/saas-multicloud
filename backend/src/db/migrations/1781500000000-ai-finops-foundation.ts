import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiFinopsFoundation1781500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_providers" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "name" character varying(100) NOT NULL,
                "slug" character varying(64) NOT NULL UNIQUE,
                "description" text,
                "capabilities" jsonb NOT NULL DEFAULT '{}',
                "status" character varying(32) NOT NULL DEFAULT 'active',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_connections" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "provider_id" uuid NOT NULL,
                "provider_slug" character varying(64) NOT NULL,
                "name" character varying(255) NOT NULL,
                "provider_account_id" character varying(255),
                "provider_project_id" character varying(255),
                "region" character varying(64),
                "status" character varying(32) NOT NULL DEFAULT 'pending',
                "status_message" text,
                "last_sync_at" TIMESTAMPTZ,
                "last_sync_status" character varying(32),
                "models_count" integer NOT NULL DEFAULT 0,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_connections_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_connections_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_connections_provider" FOREIGN KEY ("provider_id") REFERENCES "ai_finops_providers"("id") ON DELETE RESTRICT
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_finops_connections_tenant_org" ON "ai_finops_connections" ("tenant_id", "organization_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_finops_connections_provider" ON "ai_finops_connections" ("provider_id")`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_credentials" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "connection_id" uuid NOT NULL,
                "credential_type" character varying(64) NOT NULL DEFAULT 'api_key',
                "encrypted_value" text NOT NULL,
                "masked_hint" character varying(64),
                "encryption_metadata" jsonb NOT NULL DEFAULT '{}',
                "expires_at" TIMESTAMPTZ,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_credentials_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_credentials_connection" FOREIGN KEY ("connection_id") REFERENCES "ai_finops_connections"("id") ON DELETE CASCADE,
                CONSTRAINT "UQ_ai_finops_credentials_tenant_connection" UNIQUE ("tenant_id", "connection_id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_teams" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" character varying(255) NOT NULL,
                "description" text,
                "status" character varying(32) NOT NULL DEFAULT 'active',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_teams_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_teams_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_finops_teams_tenant_org" ON "ai_finops_teams" ("tenant_id", "organization_id")`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_team_members" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "team_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "role_in_team" character varying(32) NOT NULL DEFAULT 'member',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_team_members_team" FOREIGN KEY ("team_id") REFERENCES "ai_finops_teams"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_team_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "UQ_ai_finops_team_members_team_user" UNIQUE ("team_id", "user_id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_models" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "provider_id" uuid NOT NULL,
                "model_identifier" character varying(255) NOT NULL,
                "display_name" character varying(255) NOT NULL,
                "modality" character varying(64),
                "context_window" integer,
                "capabilities" jsonb NOT NULL DEFAULT '{}',
                "status" character varying(32) NOT NULL DEFAULT 'active',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_models_provider" FOREIGN KEY ("provider_id") REFERENCES "ai_finops_providers"("id") ON DELETE CASCADE,
                CONSTRAINT "UQ_ai_finops_models_provider_identifier" UNIQUE ("provider_id", "model_identifier")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_model_pricing" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "model_id" uuid NOT NULL,
                "token_type" character varying(64) NOT NULL,
                "unit" character varying(64) NOT NULL DEFAULT '1M_tokens',
                "price" numeric(18,8) NOT NULL,
                "currency" character varying(10) NOT NULL DEFAULT 'USD',
                "region" character varying(64),
                "effective_from" TIMESTAMPTZ NOT NULL,
                "effective_until" TIMESTAMPTZ,
                "source" character varying(128) NOT NULL DEFAULT 'manual',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_model_pricing_model" FOREIGN KEY ("model_id") REFERENCES "ai_finops_models"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_applications" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" character varying(255) NOT NULL,
                "description" text,
                "status" character varying(32) NOT NULL DEFAULT 'active',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_applications_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_applications_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_api_keys" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "application_id" uuid NOT NULL,
                "user_id" uuid,
                "name" character varying(128) NOT NULL,
                "key_hash" character varying(128) NOT NULL,
                "key_prefix" character varying(16) NOT NULL,
                "permissions" jsonb NOT NULL DEFAULT '{}',
                "allowed_providers" jsonb NOT NULL DEFAULT '[]',
                "allowed_models" jsonb NOT NULL DEFAULT '[]',
                "expires_at" TIMESTAMPTZ,
                "last_used_at" TIMESTAMPTZ,
                "revoked_at" TIMESTAMPTZ,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_api_keys_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_api_keys_app" FOREIGN KEY ("application_id") REFERENCES "ai_finops_applications"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_api_keys_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_finops_api_keys_prefix" ON "ai_finops_api_keys" ("key_prefix")`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_usage_records" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "connection_id" uuid,
                "provider" character varying(64) NOT NULL,
                "provider_account_id" character varying(255),
                "provider_project_id" character varying(255),
                "user_id" uuid,
                "team_id" uuid,
                "application_id" uuid,
                "model" character varying(255) NOT NULL,
                "request_id" character varying(255),
                "provider_request_id" character varying(255),
                "input_tokens" bigint NOT NULL DEFAULT 0,
                "output_tokens" bigint NOT NULL DEFAULT 0,
                "cached_input_tokens" bigint NOT NULL DEFAULT 0,
                "reasoning_tokens" bigint NOT NULL DEFAULT 0,
                "other_tokens" bigint NOT NULL DEFAULT 0,
                "total_tokens" bigint NOT NULL DEFAULT 0,
                "estimated_cost" numeric(18,8),
                "official_cost" numeric(18,8),
                "currency" character varying(10) NOT NULL DEFAULT 'USD',
                "latency_ms" integer,
                "status" character varying(32) NOT NULL DEFAULT 'success',
                "usage_source" character varying(32) NOT NULL,
                "occurred_at" TIMESTAMPTZ NOT NULL,
                "recorded_at" TIMESTAMP NOT NULL DEFAULT now(),
                "metadata" jsonb NOT NULL DEFAULT '{}',
                CONSTRAINT "FK_ai_finops_usage_records_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_usage_records_connection" FOREIGN KEY ("connection_id") REFERENCES "ai_finops_connections"("id") ON DELETE SET NULL
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_finops_usage_tenant_occurred" ON "ai_finops_usage_records" ("tenant_id", "occurred_at")`);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_finops_usage_idempotency"
            ON "ai_finops_usage_records" ("connection_id", "provider_request_id")
            WHERE "provider_request_id" IS NOT NULL AND "connection_id" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_usage_daily" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "connection_id" uuid,
                "provider" character varying(64) NOT NULL,
                "application_id" uuid,
                "user_id" uuid,
                "team_id" uuid,
                "model" character varying(255) NOT NULL,
                "usage_source" character varying(32) NOT NULL,
                "usage_date" date NOT NULL,
                "input_tokens" bigint NOT NULL DEFAULT 0,
                "output_tokens" bigint NOT NULL DEFAULT 0,
                "total_tokens" bigint NOT NULL DEFAULT 0,
                "estimated_cost" numeric(18,8) NOT NULL DEFAULT 0,
                "official_cost" numeric(18,8) NOT NULL DEFAULT 0,
                "currency" character varying(10) NOT NULL DEFAULT 'USD',
                "request_count" integer NOT NULL DEFAULT 0,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_finops_usage_daily_tenant_date" ON "ai_finops_usage_daily" ("tenant_id", "usage_date")`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_policies" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "scope_type" character varying(32) NOT NULL,
                "scope_id" uuid,
                "name" character varying(255) NOT NULL,
                "max_tokens" bigint,
                "max_cost" numeric(18,4),
                "max_requests_per_minute" integer,
                "allowed_providers" jsonb NOT NULL DEFAULT '[]',
                "allowed_models" jsonb NOT NULL DEFAULT '[]',
                "on_limit_action" character varying(32) NOT NULL DEFAULT 'notify',
                "fallback_config" jsonb NOT NULL DEFAULT '{}',
                "status" character varying(32) NOT NULL DEFAULT 'active',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_policies_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_budgets" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" character varying(255) NOT NULL,
                "scope_type" character varying(32) NOT NULL,
                "scope_id" character varying(255),
                "budget_amount" numeric(18,4) NOT NULL,
                "currency" character varying(10) NOT NULL DEFAULT 'USD',
                "period" character varying(20) NOT NULL DEFAULT 'monthly',
                "alert_thresholds" jsonb NOT NULL DEFAULT '[50, 75, 90, 100]',
                "alert_channels" jsonb NOT NULL DEFAULT '["email"]',
                "alert_notification_group_ids" jsonb NOT NULL DEFAULT '[]',
                "status" character varying(32) NOT NULL DEFAULT 'active',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_budgets_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_provider_syncs" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "connection_id" uuid NOT NULL,
                "sync_type" character varying(64) NOT NULL DEFAULT 'incremental',
                "status" character varying(32) NOT NULL DEFAULT 'pending',
                "started_at" TIMESTAMPTZ,
                "finished_at" TIMESTAMPTZ,
                "records_processed" integer NOT NULL DEFAULT 0,
                "error_message" text,
                "metadata" jsonb NOT NULL DEFAULT '{}',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_provider_syncs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_provider_syncs_connection" FOREIGN KEY ("connection_id") REFERENCES "ai_finops_connections"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_alerts" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "alert_type" character varying(64) NOT NULL,
                "scope_type" character varying(32),
                "scope_id" character varying(255),
                "dedupe_key" character varying(255) NOT NULL,
                "message" text NOT NULL,
                "status" character varying(32) NOT NULL DEFAULT 'open',
                "triggered_at" TIMESTAMPTZ NOT NULL,
                "resolved_at" TIMESTAMPTZ,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_alerts_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "UQ_ai_finops_alerts_dedupe" UNIQUE ("tenant_id", "alert_type", "scope_type", "scope_id", "dedupe_key")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_audit_logs" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "user_id" uuid,
                "action" character varying(64) NOT NULL,
                "entity_type" character varying(64) NOT NULL,
                "entity_id" uuid,
                "metadata" jsonb NOT NULL DEFAULT '{}',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_audit_logs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_finops_audit_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_finops_recommendations" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "title" character varying(255) NOT NULL,
                "description" text NOT NULL,
                "estimated_impact" numeric(18,4),
                "impact_currency" character varying(10) NOT NULL DEFAULT 'USD',
                "rationale" text NOT NULL,
                "entity_type" character varying(64),
                "entity_id" character varying(255),
                "suggested_action" text,
                "status" character varying(32) NOT NULL DEFAULT 'open',
                "identified_at" TIMESTAMPTZ NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_finops_recommendations_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            INSERT INTO "ai_finops_providers" ("name", "slug", "description", "capabilities", "status")
            VALUES
            ('OpenAI', 'openai', 'OpenAI API (BYOK)', '{"validateCredentials":true,"listModels":true,"listProjects":false,"fetchUsage":false,"fetchCosts":false,"fetchLimits":false,"usageByUser":false,"syncHistorical":false}', 'active'),
            ('Anthropic', 'anthropic', 'Anthropic Claude API (BYOK)', '{"validateCredentials":false,"listModels":false,"listProjects":false,"fetchUsage":false,"fetchCosts":false,"fetchLimits":false,"usageByUser":false,"syncHistorical":false}', 'active'),
            ('Google Gemini', 'google_gemini', 'Google Gemini API (BYOK)', '{"validateCredentials":false,"listModels":false,"listProjects":false,"fetchUsage":false,"fetchCosts":false,"fetchLimits":false,"usageByUser":false,"syncHistorical":false}', 'active'),
            ('AWS Bedrock', 'aws_bedrock', 'Amazon Bedrock (BYOK)', '{"validateCredentials":false,"listModels":false,"listProjects":false,"fetchUsage":false,"fetchCosts":false,"fetchLimits":false,"usageByUser":false,"syncHistorical":false}', 'active'),
            ('Azure AI Foundry', 'azure_ai_foundry', 'Azure AI Foundry (BYOK)', '{"validateCredentials":false,"listModels":false,"listProjects":false,"fetchUsage":false,"fetchCosts":false,"fetchLimits":false,"usageByUser":false,"syncHistorical":false}', 'active'),
            ('DeepSeek', 'deepseek', 'DeepSeek API (BYOK)', '{"validateCredentials":false,"listModels":false,"listProjects":false,"fetchUsage":false,"fetchCosts":false,"fetchLimits":false,"usageByUser":false,"syncHistorical":false}', 'active'),
            ('Mistral', 'mistral', 'Mistral API (BYOK)', '{"validateCredentials":false,"listModels":false,"listProjects":false,"fetchUsage":false,"fetchCosts":false,"fetchLimits":false,"usageByUser":false,"syncHistorical":false}', 'active'),
            ('Groq', 'groq', 'Groq API (BYOK)', '{"validateCredentials":false,"listModels":false,"listProjects":false,"fetchUsage":false,"fetchCosts":false,"fetchLimits":false,"usageByUser":false,"syncHistorical":false}', 'active')
            ON CONFLICT ("slug") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_recommendations"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_audit_logs"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_alerts"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_provider_syncs"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_budgets"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_policies"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_usage_daily"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_usage_records"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_api_keys"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_applications"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_model_pricing"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_models"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_team_members"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_teams"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_credentials"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_connections"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_finops_providers"`);
    }
}
