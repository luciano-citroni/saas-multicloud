import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantInviteOrganizationIds1778200000000 implements MigrationInterface {
    name = 'AddTenantInviteOrganizationIds1778200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_invites" ADD COLUMN IF NOT EXISTS "organization_ids" uuid[] NOT NULL DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_invites" DROP COLUMN IF EXISTS "organization_ids"`);
    }
}
