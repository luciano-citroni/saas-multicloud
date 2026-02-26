import { MigrationInterface, QueryRunner } from "typeorm";

export class UsersSessions1772067437762 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "users_sessions" (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                userId uuid not null,
                token VARCHAR(255) not null,
                createdAt TIMESTAMP DEFAULT now(),
                updatedAt TIMESTAMP DEFAULT now(),
                CONSTRAINT "FK_users_sessions_userId" FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE IF EXISTS "users_sessions";
        `);
    }

}
