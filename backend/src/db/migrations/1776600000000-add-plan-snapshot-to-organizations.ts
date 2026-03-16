import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanSnapshotToOrganizations1776600000000 implements MigrationInterface {
    name = 'AddPlanSnapshotToOrganizations1776600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN "max_cloud_accounts" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN "max_users" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN "plans" text[] NOT NULL DEFAULT '{}'::text[]`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "plans"`);
        await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "max_users"`);
        await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "max_cloud_accounts"`);
    }
}
