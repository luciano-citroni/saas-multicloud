import { MigrationInterface, QueryRunner } from 'typeorm';

export class CloudAccountOptionalOrganization1777900000000 implements MigrationInterface {
    name = 'CloudAccountOptionalOrganization1777900000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Remove the old CASCADE FK on organization_id
        await queryRunner.query(`ALTER TABLE "cloud_accounts" DROP CONSTRAINT IF EXISTS "FK_cloud_accounts_organization_id"`);
        await queryRunner.query(`
            DO $$
            DECLARE r RECORD;
            BEGIN
                FOR r IN
                    SELECT tc.constraint_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                    WHERE tc.table_name = 'cloud_accounts'
                      AND tc.constraint_type = 'FOREIGN KEY'
                      AND kcu.column_name = 'organization_id'
                LOOP
                    EXECUTE 'ALTER TABLE cloud_accounts DROP CONSTRAINT ' || quote_ident(r.constraint_name);
                END LOOP;
            END $$;
        `);

        // Make organization_id nullable
        await queryRunner.query(`ALTER TABLE "cloud_accounts" ALTER COLUMN "organization_id" DROP NOT NULL`);

        // Re-add FK with SET NULL on delete
        await queryRunner.query(`
            ALTER TABLE "cloud_accounts"
            ADD CONSTRAINT "FK_cloud_accounts_organization_id"
            FOREIGN KEY ("organization_id")
            REFERENCES "organizations"("id")
            ON DELETE SET NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restore NOT NULL (set NULL values back to tenant_id as placeholder)
        await queryRunner.query(`
            UPDATE "cloud_accounts"
            SET "organization_id" = "tenant_id"
            WHERE "organization_id" IS NULL
        `);

        await queryRunner.query(`ALTER TABLE "cloud_accounts" DROP CONSTRAINT IF EXISTS "FK_cloud_accounts_organization_id"`);
        await queryRunner.query(`ALTER TABLE "cloud_accounts" ALTER COLUMN "organization_id" SET NOT NULL`);

        await queryRunner.query(`
            ALTER TABLE "cloud_accounts"
            ADD CONSTRAINT "FK_cloud_accounts_organization_id"
            FOREIGN KEY ("organization_id")
            REFERENCES "organizations"("id")
            ON DELETE CASCADE
        `);
    }
}
