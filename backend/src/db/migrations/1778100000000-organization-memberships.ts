import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationMemberships1778100000000 implements MigrationInterface {
    name = 'OrganizationMemberships1778100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "organization_members" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "organization_id" UUID NOT NULL,
                "user_id" UUID NOT NULL,
                "role" VARCHAR(50) NOT NULL,
                "joined_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_organization_members_organization_id"
                    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_organization_members_user_id"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "CHK_organization_members_role"
                    CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER'))
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_organization_members_user_org"
            ON "organization_members" ("organization_id", "user_id")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_organization_members_org_id"
            ON "organization_members" ("organization_id")
        `);

        await queryRunner.query(`
            INSERT INTO "organization_members" (
                "id",
                "organization_id",
                "user_id",
                "role",
                "joined_at",
                "created_at",
                "updated_at"
            )
            SELECT
                uuid_generate_v4(),
                org."id",
                tm."user_id",
                tm."role",
                tm."joined_at",
                tm."created_at",
                tm."updated_at"
            FROM "tenant_members" tm
            JOIN LATERAL (
                SELECT o."id"
                FROM "organizations" o
                WHERE o."tenant_id" = tm."tenant_id"
                ORDER BY o."created_at" ASC, o."id" ASC
                LIMIT 1
            ) org ON true
            ON CONFLICT ("organization_id", "user_id") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS "organization_members"');
    }
}
