import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGcpCloudRunJobs1775832000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_cloud_run_jobs" (
                "id"                        UUID            NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id"          UUID            NOT NULL,
                "gcp_job_name"              VARCHAR(500)    NOT NULL,
                "name"                      VARCHAR(255)    NOT NULL,
                "region"                    VARCHAR(100)    NOT NULL,
                "condition"                 VARCHAR(50),
                "container_image"           VARCHAR(500),
                "cpu_limit"                 VARCHAR(30),
                "memory_limit"              VARCHAR(30),
                "task_count"                INTEGER,
                "max_retries"               INTEGER,
                "execution_count"           INTEGER,
                "latest_created_execution"  VARCHAR(300),
                "labels"                    JSONB,
                "create_time"               TIMESTAMP,
                "last_synced_at"            TIMESTAMP,
                "created_at"                TIMESTAMP       NOT NULL DEFAULT now(),
                "updated_at"                TIMESTAMP       NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_cloud_run_jobs" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_cloud_run_jobs_account_name" UNIQUE ("cloud_account_id", "gcp_job_name"),
                CONSTRAINT "FK_gcp_cloud_run_jobs_cloud_account"
                    FOREIGN KEY ("cloud_account_id")
                    REFERENCES "cloud_accounts" ("id")
                    ON DELETE CASCADE
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_cloud_run_jobs"`);
    }
}
