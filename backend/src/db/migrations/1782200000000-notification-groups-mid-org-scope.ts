import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationGroupsMidOrgScope1782200000000 implements MigrationInterface {
    name = 'NotificationGroupsMidOrgScope1782200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "organization_notification_groups"
            ADD COLUMN IF NOT EXISTS "mid_org_id" uuid
        `);
        await queryRunner.query(`
            ALTER TABLE "organization_notification_groups"
            ADD COLUMN IF NOT EXISTS "is_tenant_global" boolean NOT NULL DEFAULT false
        `);

        // Preserve previous tenant-wide behavior for existing groups.
        await queryRunner.query(`
            UPDATE "organization_notification_groups"
            SET "is_tenant_global" = true
            WHERE "mid_org_id" IS NULL
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'fk_org_notification_groups_mid_org'
                ) THEN
                    ALTER TABLE "organization_notification_groups"
                    ADD CONSTRAINT "fk_org_notification_groups_mid_org"
                    FOREIGN KEY ("mid_org_id") REFERENCES "organizations"("id")
                    ON DELETE CASCADE;
                END IF;
            END $$;
        `);

        await queryRunner.query(`DROP INDEX IF EXISTS "uq_org_notification_groups_org_channel_name"`);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "uq_org_notification_groups_global_name"
            ON "organization_notification_groups" ("organization_id", "channel", "name")
            WHERE "is_tenant_global" = true
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "uq_org_notification_groups_mid_org_name"
            ON "organization_notification_groups" ("organization_id", "mid_org_id", "channel", "name")
            WHERE "is_tenant_global" = false AND "mid_org_id" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_org_notification_groups_tenant_mid_org"
            ON "organization_notification_groups" ("organization_id", "mid_org_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_org_notification_groups_tenant_mid_org"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "uq_org_notification_groups_mid_org_name"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "uq_org_notification_groups_global_name"`);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "uq_org_notification_groups_org_channel_name"
            ON "organization_notification_groups" ("organization_id", "channel", "name")
        `);

        await queryRunner.query(`
            ALTER TABLE "organization_notification_groups"
            DROP CONSTRAINT IF EXISTS "fk_org_notification_groups_mid_org"
        `);
        await queryRunner.query(`
            ALTER TABLE "organization_notification_groups"
            DROP COLUMN IF EXISTS "is_tenant_global"
        `);
        await queryRunner.query(`
            ALTER TABLE "organization_notification_groups"
            DROP COLUMN IF EXISTS "mid_org_id"
        `);
    }
}
