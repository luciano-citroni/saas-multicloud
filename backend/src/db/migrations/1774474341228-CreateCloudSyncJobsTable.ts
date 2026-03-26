import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCloudSyncJobsTable1774474341228 implements MigrationInterface {
    name = 'CreateCloudSyncJobsTable1774474341228';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "cloud_sync_jobs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "cloud_account_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "provider" character varying(10) NOT NULL,
                "status" character varying(20) NOT NULL DEFAULT 'running',
                "error" text,
                "completed_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_aba674ba083d0d34bb54e2917e8" PRIMARY KEY ("id")
            )`
        );

        await queryRunner.query(
            `ALTER TABLE "cloud_sync_jobs" ADD CONSTRAINT "FK_1c8992560023179a9368fd77b8e" FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cloud_sync_jobs" DROP CONSTRAINT "FK_1c8992560023179a9368fd77b8e"`);

        await queryRunner.query(`DROP TABLE "cloud_sync_jobs"`);
    }
}
