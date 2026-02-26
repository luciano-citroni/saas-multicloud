import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationMembers1772067558029 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "organization_members" (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                organization_id uuid not null,
                user_id uuid not null,
                role VARCHAR(50) not null,
                joined_at TIMESTAMP DEFAULT now(),
                created_at TIMESTAMP DEFAULT now(),
                updated_at TIMESTAMP DEFAULT now(),
                CONSTRAINT "FK_organization_members_organization_id" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
                CONSTRAINT "FK_organization_members_user_id" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE IF EXISTS "organization_members";
        `);
    }
}
