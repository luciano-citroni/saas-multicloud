import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationGroups1779300000000 implements MigrationInterface {
    name = 'NotificationGroups1779300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "organization_notification_groups" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "organization_id" uuid NOT NULL,
                "name" varchar(120) NOT NULL,
                "description" varchar(255) NULL,
                "channel" varchar(20) NOT NULL DEFAULT 'email',
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" timestamp NOT NULL DEFAULT now(),
                "updated_at" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "pk_organization_notification_groups" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_org_notification_groups_org_channel_name"
                ON "organization_notification_groups" ("organization_id", "channel", "name")
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_org_notification_groups_org_channel"
                ON "organization_notification_groups" ("organization_id", "channel")
        `);

        // Migra e-mails soltos para um grupo padrão por organização.
        await queryRunner.query(`
            INSERT INTO "organization_notification_groups" ("organization_id", "name", "description", "channel", "is_active")
            SELECT DISTINCT "organization_id", 'Geral', 'Grupo migrado automaticamente', 'email', true
            FROM "organization_notification_emails"
        `);

        await queryRunner.query(`
            ALTER TABLE "organization_notification_emails"
                ADD COLUMN "group_id" uuid NULL
        `);

        await queryRunner.query(`
            UPDATE "organization_notification_emails" e
            SET "group_id" = g."id"
            FROM "organization_notification_groups" g
            WHERE g."organization_id" = e."organization_id"
              AND g."channel" = 'email'
              AND g."name" = 'Geral'
        `);

        await queryRunner.query(`
            DELETE FROM "organization_notification_emails" WHERE "group_id" IS NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "organization_notification_emails"
                ALTER COLUMN "group_id" SET NOT NULL
        `);

        await queryRunner.query(`DROP INDEX IF EXISTS "uq_org_notification_emails_org_email"`);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_org_notification_emails_group_email"
                ON "organization_notification_emails" ("group_id", "email")
        `);

        await queryRunner.query(`
            ALTER TABLE "organization_notification_emails"
                ADD CONSTRAINT "fk_org_notification_emails_group"
                FOREIGN KEY ("group_id")
                REFERENCES "organization_notification_groups"("id")
                ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "organization_notification_emails"
                DROP CONSTRAINT IF EXISTS "fk_org_notification_emails_group"
        `);
        await queryRunner.query(`DROP INDEX IF EXISTS "uq_org_notification_emails_group_email"`);

        await queryRunner.query(`
            ALTER TABLE "organization_notification_emails"
                DROP COLUMN IF EXISTS "group_id"
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_org_notification_emails_org_email"
                ON "organization_notification_emails" ("organization_id", "email")
        `);

        await queryRunner.query(`DROP INDEX IF EXISTS "idx_org_notification_groups_org_channel"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "uq_org_notification_groups_org_channel_name"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_notification_groups"`);
    }
}
