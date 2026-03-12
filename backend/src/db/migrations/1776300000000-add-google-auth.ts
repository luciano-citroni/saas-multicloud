import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleAuth1776300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
                ALTER COLUMN "password" DROP NOT NULL,
                ALTER COLUMN "cpf" DROP NOT NULL;
        `);

        await queryRunner.query(`
            ALTER TABLE "users"
                ADD COLUMN IF NOT EXISTS "google_id" VARCHAR(255) UNIQUE;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "google_id";`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "cpf" SET NOT NULL;`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL;`);
    }
}
