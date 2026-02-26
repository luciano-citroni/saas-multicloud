import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersSessions1772067437762 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "users_sessions" (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id uuid not null,
                token VARCHAR(255) not null,
                expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
                created_at TIMESTAMP DEFAULT now(),
                updated_at TIMESTAMP DEFAULT now(),
                CONSTRAINT "FK_users_sessions_user_id" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE IF EXISTS "users_sessions";
        `);
    }
}
