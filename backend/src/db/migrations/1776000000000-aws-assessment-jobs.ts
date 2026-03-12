import { MigrationInterface, QueryRunner } from 'typeorm';

export class AwsAssessmentJobs1776000000000 implements MigrationInterface {
    name = 'AwsAssessmentJobs1776000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "aws_assessment_jobs" (
                "id"               uuid                NOT NULL DEFAULT uuid_generate_v4(),
                "cloudAccountId"   uuid                NOT NULL,
                "organizationId"   uuid                NOT NULL,
                "status"           character varying   NOT NULL DEFAULT 'pending',
                "error"            text,
                "excelFileName"    character varying,
                "architectureJson" jsonb,
                "mermaidDiagram"   text,
                "summary"          jsonb,
                "completedAt"      TIMESTAMP,
                "createdAt"        TIMESTAMP           NOT NULL DEFAULT now(),
                "updatedAt"        TIMESTAMP           NOT NULL DEFAULT now(),
                CONSTRAINT "PK_aws_assessment_jobs" PRIMARY KEY ("id"),
                CONSTRAINT "FK_aws_assessment_jobs_cloud_account"
                    FOREIGN KEY ("cloudAccountId")
                    REFERENCES "cloud_accounts"("id")
                    ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_aws_assessment_jobs_cloudAccountId" ON "aws_assessment_jobs" ("cloudAccountId")`);
        await queryRunner.query(`CREATE INDEX "IDX_aws_assessment_jobs_organizationId" ON "aws_assessment_jobs" ("organizationId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_aws_assessment_jobs_organizationId"`);
        await queryRunner.query(`DROP INDEX "IDX_aws_assessment_jobs_cloudAccountId"`);
        await queryRunner.query(`DROP TABLE "aws_assessment_jobs"`);
    }
}
