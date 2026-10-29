import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiChat1779000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_chat_conversations" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "organization_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "title" character varying(200) NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_chat_conversations_organization"
                    FOREIGN KEY ("organization_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_chat_conversations_user"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_chat_conversations_org_user_updated"
            ON "ai_chat_conversations" ("organization_id", "user_id", "updated_at" DESC)
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_chat_messages" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "conversation_id" uuid NOT NULL,
                "role" character varying(20) NOT NULL,
                "content" text NOT NULL,
                "sources" jsonb,
                "tool_name" character varying(100),
                "token_usage" jsonb,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_chat_messages_conversation"
                    FOREIGN KEY ("conversation_id") REFERENCES "ai_chat_conversations"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_chat_messages_conversation_created"
            ON "ai_chat_messages" ("conversation_id", "created_at")
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_chat_audit_events" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "organization_id" uuid NOT NULL,
                "actor_id" uuid,
                "action" character varying(64) NOT NULL,
                "entity_type" character varying(64) NOT NULL,
                "entity_id" uuid,
                "metadata" jsonb NOT NULL DEFAULT '{}',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_chat_audit_events_organization"
                    FOREIGN KEY ("organization_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_chat_audit_events_org_created"
            ON "ai_chat_audit_events" ("organization_id", "created_at" DESC)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_chat_audit_events_org_created"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_chat_audit_events"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_chat_messages_conversation_created"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_chat_messages"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_chat_conversations_org_user_updated"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_chat_conversations"`);
    }
}
