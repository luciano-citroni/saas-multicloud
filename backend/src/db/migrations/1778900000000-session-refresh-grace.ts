import { MigrationInterface, QueryRunner } from 'typeorm';

export class SessionRefreshGrace1778900000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users_sessions"
            ADD COLUMN IF NOT EXISTS "previous_token_hash" character varying(64),
            ADD COLUMN IF NOT EXISTS "rotated_at" TIMESTAMP,
            ADD COLUMN IF NOT EXISTS "successor_token" text
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_users_sessions_previous_token_hash"
            ON "users_sessions" ("previous_token_hash")
            WHERE "previous_token_hash" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_sessions_previous_token_hash"`);
        await queryRunner.query(`
            ALTER TABLE "users_sessions"
            DROP COLUMN IF EXISTS "successor_token",
            DROP COLUMN IF EXISTS "rotated_at",
            DROP COLUMN IF EXISTS "previous_token_hash"
        `);
    }
}
