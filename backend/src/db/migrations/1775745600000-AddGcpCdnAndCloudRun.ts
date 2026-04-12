import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGcpCdnAndCloudRun1775745600000 implements MigrationInterface {
    name = 'AddGcpCdnAndCloudRun1775745600000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_cdn_backend_services" (
                "id"                              UUID              NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id"                UUID              NOT NULL,
                "gcp_backend_service_id"          VARCHAR(100)      NOT NULL,
                "name"                            VARCHAR(255)      NOT NULL,
                "region"                          VARCHAR(100)      NOT NULL,
                "load_balancing_scheme"           VARCHAR(50),
                "protocol"                        VARCHAR(20),
                "cdn_enabled"                     BOOLEAN           NOT NULL DEFAULT false,
                "cache_mode"                      VARCHAR(50),
                "default_ttl_seconds"             INTEGER,
                "max_ttl_seconds"                 INTEGER,
                "connection_draining_timeout_sec" INTEGER,
                "backends"                        JSONB,
                "last_synced_at"                  TIMESTAMP,
                "created_at"                      TIMESTAMP         NOT NULL DEFAULT now(),
                "updated_at"                      TIMESTAMP         NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_cdn_backend_services" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_cdn_backend_services_account_bs" UNIQUE ("cloud_account_id", "gcp_backend_service_id"),
                CONSTRAINT "FK_gcp_cdn_backend_services_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts" ("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_cloud_run_services" (
                "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id"     UUID         NOT NULL,
                "gcp_service_name"     VARCHAR(500) NOT NULL,
                "name"                 VARCHAR(255) NOT NULL,
                "region"               VARCHAR(100) NOT NULL,
                "condition"            VARCHAR(50),
                "uri"                  VARCHAR(500),
                "allows_unauthenticated" BOOLEAN    NOT NULL DEFAULT false,
                "latest_ready_revision" VARCHAR(300),
                "container_image"      VARCHAR(500),
                "max_instance_count"   INTEGER,
                "min_instance_count"   INTEGER,
                "cpu_limit"            VARCHAR(30),
                "memory_limit"         VARCHAR(30),
                "vpc_connector"        VARCHAR(300),
                "labels"               JSONB,
                "create_time"          TIMESTAMP,
                "last_synced_at"       TIMESTAMP,
                "created_at"           TIMESTAMP    NOT NULL DEFAULT now(),
                "updated_at"           TIMESTAMP    NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_cloud_run_services" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_cloud_run_services_account_name" UNIQUE ("cloud_account_id", "gcp_service_name"),
                CONSTRAINT "FK_gcp_cloud_run_services_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts" ("id") ON DELETE CASCADE
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_cloud_run_services"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_cdn_backend_services"`);
    }
}
