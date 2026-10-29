import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationWhatsappTargets1779500000000 implements MigrationInterface {
    name = 'NotificationWhatsappTargets1779500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "organization_notification_whatsapp_targets" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "group_id" uuid NOT NULL,
                "target_type" character varying(20) NOT NULL,
                "target" character varying(120) NOT NULL,
                "label" character varying(120),
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_organization_notification_whatsapp_targets" PRIMARY KEY ("id"),
                CONSTRAINT "FK_org_notification_whatsapp_targets_group"
                    FOREIGN KEY ("group_id")
                    REFERENCES "organization_notification_groups"("id")
                    ON DELETE CASCADE
            );
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "uq_org_notification_whatsapp_targets_group_type_target"
                ON "organization_notification_whatsapp_targets" ("group_id", "target_type", "target");
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_org_notification_whatsapp_targets_org"
                ON "organization_notification_whatsapp_targets" ("organization_id");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_org_notification_whatsapp_targets_org";`);
        await queryRunner.query(
            `DROP INDEX IF EXISTS "uq_org_notification_whatsapp_targets_group_type_target";`,
        );
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_notification_whatsapp_targets";`);
    }
}
