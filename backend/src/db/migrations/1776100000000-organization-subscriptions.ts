import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationSubscriptions1776100000000 implements MigrationInterface {
    name = 'OrganizationSubscriptions1776100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "organization_subscriptions" (
                "id"                     uuid                NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id"        uuid                NOT NULL,
                "stripe_customer_id"     character varying(255) NOT NULL,
                "stripe_subscription_id" character varying(255),
                "stripe_price_id"        character varying(255),
                "stripe_product_id"      character varying(255),
                "status"                 character varying(50) NOT NULL DEFAULT 'incomplete',
                "current_period_start"   TIMESTAMP,
                "current_period_end"     TIMESTAMP,
                "cancel_at_period_end"   boolean             NOT NULL DEFAULT false,
                "created_at"             TIMESTAMP           NOT NULL DEFAULT now(),
                "updated_at"             TIMESTAMP           NOT NULL DEFAULT now(),
                CONSTRAINT "PK_organization_subscriptions" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_organization_subscriptions_org" UNIQUE ("organization_id"),
                CONSTRAINT "UQ_organization_subscriptions_customer" UNIQUE ("stripe_customer_id"),
                CONSTRAINT "UQ_organization_subscriptions_subscription" UNIQUE ("stripe_subscription_id"),
                CONSTRAINT "FK_organization_subscriptions_organization"
                    FOREIGN KEY ("organization_id")
                    REFERENCES "organizations"("id")
                    ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_org_subscriptions_organization_id" ON "organization_subscriptions" ("organization_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_org_subscriptions_stripe_customer_id" ON "organization_subscriptions" ("stripe_customer_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_org_subscriptions_status" ON "organization_subscriptions" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_org_subscriptions_status"`);
        await queryRunner.query(`DROP INDEX "IDX_org_subscriptions_stripe_customer_id"`);
        await queryRunner.query(`DROP INDEX "IDX_org_subscriptions_organization_id"`);
        await queryRunner.query(`DROP TABLE "organization_subscriptions"`);
    }
}
