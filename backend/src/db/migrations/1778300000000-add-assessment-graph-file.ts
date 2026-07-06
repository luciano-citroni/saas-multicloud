import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssessmentGraphFile1778300000000 implements MigrationInterface {
    name = 'AddAssessmentGraphFile1778300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "aws_assessment_jobs" ADD COLUMN IF NOT EXISTS "graphFileName" character varying`);
        await queryRunner.query(`ALTER TABLE "gcp_assessment_jobs" ADD COLUMN IF NOT EXISTS "graph_file_name" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "gcp_assessment_jobs" DROP COLUMN IF EXISTS "graph_file_name"`);
        await queryRunner.query(`ALTER TABLE "aws_assessment_jobs" DROP COLUMN IF EXISTS "graphFileName"`);
    }
}
