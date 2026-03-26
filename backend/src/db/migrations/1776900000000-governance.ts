import { MigrationInterface, QueryRunner } from 'typeorm';

export class Governance1776900000000 implements MigrationInterface {
    name = 'Governance1776900000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "governance_jobs" (
                "id"               uuid                  NOT NULL DEFAULT uuid_generate_v4(),
                "cloud_account_id" uuid                  NOT NULL,
                "organization_id"  uuid                  NOT NULL,
                "provider"         character varying(20) NOT NULL DEFAULT 'aws',
                "status"           character varying(20) NOT NULL DEFAULT 'pending',
                "score"            integer,
                "total_findings"   integer,
                "total_checks"     integer,
                "error"            text,
                "completed_at"     TIMESTAMP,
                "created_at"       TIMESTAMP             NOT NULL DEFAULT now(),
                "updated_at"       TIMESTAMP             NOT NULL DEFAULT now(),
                CONSTRAINT "PK_governance_jobs" PRIMARY KEY ("id"),
                CONSTRAINT "FK_governance_jobs_cloud_account"
                    FOREIGN KEY ("cloud_account_id")
                    REFERENCES "cloud_accounts"("id")
                    ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_governance_jobs_cloud_account_id" ON "governance_jobs" ("cloud_account_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_governance_jobs_organization_id" ON "governance_jobs" ("organization_id")`);

        await queryRunner.query(`
            CREATE TABLE "governance_findings" (
                "id"              uuid                   NOT NULL DEFAULT uuid_generate_v4(),
                "job_id"          uuid                   NOT NULL,
                "cloud_account_id" uuid                  NOT NULL,
                "organization_id"  uuid                  NOT NULL,
                "resource_id"     character varying(512) NOT NULL,
                "resource_type"   character varying(100) NOT NULL,
                "policy_id"       character varying(100) NOT NULL,
                "policy_name"     character varying(255) NOT NULL,
                "severity"        character varying(20)  NOT NULL,
                "status"          character varying(20)  NOT NULL,
                "description"     text                   NOT NULL,
                "recommendation"  text                   NOT NULL,
                "metadata"        jsonb,
                "created_at"      TIMESTAMP              NOT NULL DEFAULT now(),
                CONSTRAINT "PK_governance_findings" PRIMARY KEY ("id"),
                CONSTRAINT "FK_governance_findings_job"
                    FOREIGN KEY ("job_id")
                    REFERENCES "governance_jobs"("id")
                    ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_governance_findings_job_id" ON "governance_findings" ("job_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_governance_findings_cloud_account_id" ON "governance_findings" ("cloud_account_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_governance_findings_status" ON "governance_findings" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_governance_findings_status"`);
        await queryRunner.query(`DROP INDEX "IDX_governance_findings_cloud_account_id"`);
        await queryRunner.query(`DROP INDEX "IDX_governance_findings_job_id"`);
        await queryRunner.query(`DROP TABLE "governance_findings"`);
        await queryRunner.query(`DROP INDEX "IDX_governance_jobs_organization_id"`);
        await queryRunner.query(`DROP INDEX "IDX_governance_jobs_cloud_account_id"`);
        await queryRunner.query(`DROP TABLE "governance_jobs"`);
    }
}
