import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleAuthCodes1776400000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "google_auth_codes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code_hash" character varying(255) NOT NULL,
                "user_id" uuid NOT NULL,
                "expires_at" TIMESTAMP NOT NULL,
                "used_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_google_auth_codes_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_google_auth_codes_code_hash" UNIQUE ("code_hash"),
                CONSTRAINT "FK_google_auth_codes_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_google_auth_codes_expires_at" ON "google_auth_codes" ("expires_at");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_google_auth_codes_expires_at";`);
        await queryRunner.query(`DROP TABLE IF EXISTS "google_auth_codes";`);
    }
}
