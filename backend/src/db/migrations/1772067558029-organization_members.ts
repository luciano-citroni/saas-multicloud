import { MigrationInterface, QueryRunner } from "typeorm";

export class OrganizationMembers1772067558029 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "organization_members" (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                organizationId uuid not null,
                userId uuid not null,
                role VARCHAR(50) not null,
                joinedAt TIMESTAMP DEFAULT now(),
                createdAt TIMESTAMP DEFAULT now(),
                updatedAt TIMESTAMP DEFAULT now(),
                CONSTRAINT "FK_organization_members_organizationId" FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE,
                CONSTRAINT "FK_organization_members_userId" FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE IF EXISTS "organization_members";
        `);
    }

}
