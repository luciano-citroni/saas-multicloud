import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailVerification1779400000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Nullable first so existing rows stay NULL and can be grandfathered safely on re-runs.
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "email_verified" boolean;
        `);

        await queryRunner.query(`
            UPDATE "users" SET "email_verified" = true WHERE "email_verified" IS NULL;
        `);

        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "email_verified" SET DEFAULT false;
        `);

        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "email_verified" SET NOT NULL;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "token_hash" character varying(255) NOT NULL,
                "user_id" uuid NOT NULL,
                "expires_at" TIMESTAMP NOT NULL,
                "used_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_email_verification_tokens_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_email_verification_tokens_token_hash" UNIQUE ("token_hash"),
                CONSTRAINT "FK_email_verification_tokens_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_email_verification_tokens_user_id"
            ON "email_verification_tokens" ("user_id");
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_email_verification_tokens_expires_at"
            ON "email_verification_tokens" ("expires_at");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_verification_tokens_expires_at";`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_verification_tokens_user_id";`);
        await queryRunner.query(`DROP TABLE IF EXISTS "email_verification_tokens";`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified";`);
    }
}
