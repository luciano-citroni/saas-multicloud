import { MigrationInterface, QueryRunner } from 'typeorm';

export class AwsAssessmentJobsRemoveDerivedColumns1776200000000 implements MigrationInterface {
    name = 'AwsAssessmentJobsRemoveDerivedColumns1776200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "aws_assessment_jobs"
            DROP COLUMN IF EXISTS "architectureJson"
        `);

        await queryRunner.query(`
            ALTER TABLE "aws_assessment_jobs"
            DROP COLUMN IF EXISTS "mermaidDiagram"
        `);

        await queryRunner.query(`
            ALTER TABLE "aws_assessment_jobs"
            DROP COLUMN IF EXISTS "summary"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "aws_assessment_jobs"
            ADD COLUMN "architectureJson" jsonb
        `);

        await queryRunner.query(`
            ALTER TABLE "aws_assessment_jobs"
            ADD COLUMN "mermaidDiagram" text
        `);

        await queryRunner.query(`
            ALTER TABLE "aws_assessment_jobs"
            ADD COLUMN "summary" jsonb
        `);
    }
}
