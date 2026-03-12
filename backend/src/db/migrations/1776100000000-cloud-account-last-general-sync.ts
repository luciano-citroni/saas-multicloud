import { MigrationInterface, QueryRunner } from 'typeorm';

export class CloudAccountLastGeneralSync1776100000000 implements MigrationInterface {
    name = 'CloudAccountLastGeneralSync1776100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "cloud_accounts"
            ADD COLUMN "last_general_sync_at" TIMESTAMP NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "cloud_accounts"
            DROP COLUMN "last_general_sync_at"
        `);
    }
}
