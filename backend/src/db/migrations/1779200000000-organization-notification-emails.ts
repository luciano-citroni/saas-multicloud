import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationNotificationEmails1779200000000 implements MigrationInterface {
    name = 'OrganizationNotificationEmails1779200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "organization_notification_emails" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "organization_id" uuid NOT NULL,
                "email" varchar(320) NOT NULL,
                "label" varchar(120) NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" timestamp NOT NULL DEFAULT now(),
                "updated_at" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "pk_organization_notification_emails" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_org_notification_emails_org_email"
                ON "organization_notification_emails" ("organization_id", "email")
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_org_notification_emails_org"
                ON "organization_notification_emails" ("organization_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_org_notification_emails_org"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "uq_org_notification_emails_org_email"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_notification_emails"`);
    }
}
