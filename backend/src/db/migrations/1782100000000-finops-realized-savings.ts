import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsRealizedSavings1782100000000 implements MigrationInterface {
    name = 'FinopsRealizedSavings1782100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_realized_savings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "cloud_account_id" uuid NOT NULL,
                "provider" varchar(20) NOT NULL,
                "resource_names" jsonb NOT NULL DEFAULT '[]',
                "monthly_amount" decimal(18,2) NOT NULL,
                "currency" varchar(10) NOT NULL DEFAULT 'USD',
                "description" text NOT NULL,
                "executed_at" date NOT NULL,
                "source" varchar(20) NOT NULL DEFAULT 'manual',
                "source_recommendation_id" uuid,
                "source_commitment_recommendation_id" uuid,
                "created_by_user_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_realized_savings" PRIMARY KEY ("id"),
                CONSTRAINT "FK_finops_realized_savings_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_finops_realized_savings_org_account"
            ON "finops_realized_savings" ("organization_id", "cloud_account_id")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_finops_realized_savings_org_executed"
            ON "finops_realized_savings" ("organization_id", "executed_at")
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_realized_savings_source_rec"
            ON "finops_realized_savings" ("source_recommendation_id")
            WHERE "source_recommendation_id" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_realized_savings_source_rec"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_finops_realized_savings_org_executed"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_finops_realized_savings_org_account"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_realized_savings"`);
    }
}
