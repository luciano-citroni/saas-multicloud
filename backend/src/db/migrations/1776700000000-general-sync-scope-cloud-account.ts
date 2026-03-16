import { MigrationInterface, QueryRunner } from 'typeorm';

export class GeneralSyncScopeCloudAccount1776700000000 implements MigrationInterface {
    name = 'GeneralSyncScopeCloudAccount1776700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "cloud_accounts"
            ADD COLUMN IF NOT EXISTS "last_general_sync_at" TIMESTAMP NULL
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'organizations'
                      AND column_name = 'last_general_sync_at'
                ) THEN
                    UPDATE "cloud_accounts" ca
                    SET "last_general_sync_at" = COALESCE(ca."last_general_sync_at", o."last_general_sync_at")
                    FROM "organizations" o
                    WHERE o."id" = ca."organization_id";

                    ALTER TABLE "organizations"
                    DROP COLUMN "last_general_sync_at";
                END IF;
            END
            $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "organizations"
            ADD COLUMN IF NOT EXISTS "last_general_sync_at" TIMESTAMP NULL
        `);

        await queryRunner.query(`
            UPDATE "organizations" o
            SET "last_general_sync_at" = x."max_sync"
            FROM (
                SELECT "organization_id", MAX("last_general_sync_at") AS "max_sync"
                FROM "cloud_accounts"
                GROUP BY "organization_id"
            ) x
            WHERE o."id" = x."organization_id";
        `);

        await queryRunner.query(`
            ALTER TABLE "cloud_accounts"
            DROP COLUMN IF EXISTS "last_general_sync_at"
        `);
    }
}
