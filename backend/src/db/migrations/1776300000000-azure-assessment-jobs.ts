import { MigrationInterface, QueryRunner } from 'typeorm';

export class AzureAssessmentJobs1776300000000 implements MigrationInterface {
    name = 'AzureAssessmentJobs1776300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "azure_assessment_jobs" (
                "id"              uuid              NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id" uuid             NOT NULL,
                "organization_id" uuid              NOT NULL,
                "status"          varchar(20)       NOT NULL DEFAULT 'pending',
                "error"           text,
                "excel_file_name" varchar(255),
                "completed_at"    TIMESTAMP,
                "created_at"      TIMESTAMP         NOT NULL DEFAULT now(),
                "updated_at"      TIMESTAMP         NOT NULL DEFAULT now(),
                CONSTRAINT "PK_azure_assessment_jobs" PRIMARY KEY ("id"),
                CONSTRAINT "FK_azure_assessment_jobs_cloud_account"
                    FOREIGN KEY ("cloud_account_id")
                    REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_azure_assessment_jobs_cloud_account_id"
            ON "azure_assessment_jobs" ("cloud_account_id")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_azure_assessment_jobs_organization_id"
            ON "azure_assessment_jobs" ("organization_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_azure_assessment_jobs_organization_id"`);
        await queryRunner.query(`DROP INDEX "IDX_azure_assessment_jobs_cloud_account_id"`);
        await queryRunner.query(`DROP TABLE "azure_assessment_jobs"`);
    }
}
