import { MigrationInterface, QueryRunner } from 'typeorm';

export class CloudAccountSyncInProgress1776800000000 implements MigrationInterface {
    name = 'CloudAccountSyncInProgress1776800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "cloud_accounts"
            ADD COLUMN IF NOT EXISTS "is_general_sync_in_progress" boolean NOT NULL DEFAULT false
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "cloud_accounts"
            DROP COLUMN IF EXISTS "is_general_sync_in_progress"
        `);
    }
}
