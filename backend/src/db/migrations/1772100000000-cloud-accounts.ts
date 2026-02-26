import { MigrationInterface, QueryRunner } from 'typeorm';

export class CloudAccounts1772100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Índice composto em organization_members para acelerar o TenantGuard.
        // A query do guard faz WHERE (user_id = $1 AND organization_id = $2).
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_org_members_user_org"
            ON "organization_members" (user_id, organization_id);
        `);

        // Constraint de check para garantir integridade dos roles no banco.
        await queryRunner.query(`
            ALTER TABLE "organization_members"
            ADD CONSTRAINT "CHK_org_members_role"
            CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER'));
        `);

        // Tabela de contas de cloud por organização.
        await queryRunner.query(`
            CREATE TABLE "cloud_accounts" (
                id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                organization_id UUID NOT NULL,
                provider        VARCHAR(10) NOT NULL,
                credentials_encrypted TEXT NOT NULL,
                alias           VARCHAR(100) NOT NULL,
                is_active       BOOLEAN NOT NULL DEFAULT true,
                created_at      TIMESTAMP NOT NULL DEFAULT now(),
                updated_at      TIMESTAMP NOT NULL DEFAULT now(),

                CONSTRAINT "FK_cloud_accounts_organization_id"
                    FOREIGN KEY (organization_id)
                    REFERENCES organizations(id) ON DELETE CASCADE,

                CONSTRAINT "CHK_cloud_accounts_provider"
                    CHECK (provider IN ('aws', 'azure', 'gcp'))
            );
        `);

        // Índice para listar contas por organização (acesso mais comum).
        await queryRunner.query(`
            CREATE INDEX "IDX_cloud_accounts_organization_id"
            ON "cloud_accounts" (organization_id);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "cloud_accounts";`);

        await queryRunner.query(`
            ALTER TABLE "organization_members"
            DROP CONSTRAINT IF EXISTS "CHK_org_members_role";
        `);

        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_org_members_user_org";
        `);
    }
}
