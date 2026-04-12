import { MigrationInterface, QueryRunner } from 'typeorm';

export class GcpResources1777300000000 implements MigrationInterface {
    name = 'GcpResources1777300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── gcp_assessment_jobs ────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_assessment_jobs" (
                "id"              uuid         NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id" uuid        NOT NULL,
                "organization_id" uuid         NOT NULL,
                "status"          varchar      NOT NULL DEFAULT 'pending',
                "error"           text,
                "excel_file_name" varchar,
                "completed_at"    TIMESTAMP,
                "created_at"      TIMESTAMP    NOT NULL DEFAULT now(),
                "updated_at"      TIMESTAMP    NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_assessment_jobs" PRIMARY KEY ("id"),
                CONSTRAINT "FK_gcp_assessment_jobs_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_gcp_assessment_jobs_cloud_account_id"
            ON "gcp_assessment_jobs" ("cloud_account_id")
        `);

        // ── gcp_vm_instances ───────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_vm_instances" (
                "id"                    uuid         NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id"      uuid         NOT NULL,
                "gcp_instance_id"       varchar(30)  NOT NULL,
                "name"                  varchar(255) NOT NULL,
                "zone"                  varchar(100) NOT NULL,
                "machine_type"          varchar(100) NOT NULL,
                "status"                varchar(30)  NOT NULL,
                "network_ip"            varchar(45),
                "external_ip"           varchar(45),
                "network_interface"     varchar(500),
                "deletion_protection"   boolean      NOT NULL DEFAULT false,
                "can_ip_forward"        boolean      NOT NULL DEFAULT false,
                "service_account_email" varchar(100),
                "labels"                jsonb,
                "creation_timestamp"    TIMESTAMP,
                "last_synced_at"        TIMESTAMP,
                "created_at"            TIMESTAMP    NOT NULL DEFAULT now(),
                "updated_at"            TIMESTAMP    NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_vm_instances" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_vm_instances_account_instance" UNIQUE ("cloud_account_id", "gcp_instance_id"),
                CONSTRAINT "FK_gcp_vm_instances_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_gcp_vm_instances_cloud_account_id"
            ON "gcp_vm_instances" ("cloud_account_id")
        `);

        // ── gcp_vpc_networks ───────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_vpc_networks" (
                "id"                       uuid         NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id"         uuid         NOT NULL,
                "gcp_network_id"           varchar(30)  NOT NULL,
                "name"                     varchar(255) NOT NULL,
                "description"              text,
                "routing_mode"             varchar(20),
                "auto_create_subnetworks"  boolean      NOT NULL DEFAULT false,
                "subnetwork_urls"          jsonb,
                "creation_timestamp"       TIMESTAMP,
                "last_synced_at"           TIMESTAMP,
                "created_at"               TIMESTAMP    NOT NULL DEFAULT now(),
                "updated_at"               TIMESTAMP    NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_vpc_networks" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_vpc_networks_account_network" UNIQUE ("cloud_account_id", "gcp_network_id"),
                CONSTRAINT "FK_gcp_vpc_networks_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_gcp_vpc_networks_cloud_account_id"
            ON "gcp_vpc_networks" ("cloud_account_id")
        `);

        // ── gcp_subnetworks ────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_subnetworks" (
                "id"                       uuid         NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id"         uuid         NOT NULL,
                "gcp_subnetwork_id"        varchar(30)  NOT NULL,
                "name"                     varchar(255) NOT NULL,
                "region"                   varchar(100) NOT NULL,
                "ip_cidr_range"            varchar(50)  NOT NULL,
                "network_name"             varchar(255),
                "private_ip_google_access" boolean      NOT NULL DEFAULT false,
                "purpose"                  varchar(30),
                "creation_timestamp"       TIMESTAMP,
                "last_synced_at"           TIMESTAMP,
                "created_at"               TIMESTAMP    NOT NULL DEFAULT now(),
                "updated_at"               TIMESTAMP    NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_subnetworks" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_subnetworks_account_subnetwork" UNIQUE ("cloud_account_id", "gcp_subnetwork_id"),
                CONSTRAINT "FK_gcp_subnetworks_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_gcp_subnetworks_cloud_account_id"
            ON "gcp_subnetworks" ("cloud_account_id")
        `);

        // ── gcp_firewall_rules ─────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_firewall_rules" (
                "id"                  uuid         NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id"    uuid         NOT NULL,
                "gcp_firewall_id"     varchar(30)  NOT NULL,
                "name"                varchar(255) NOT NULL,
                "description"         text,
                "network_name"        varchar(255),
                "direction"           varchar(10)  NOT NULL,
                "priority"            integer      NOT NULL DEFAULT 1000,
                "allowed"             jsonb,
                "denied"              jsonb,
                "source_ranges"       jsonb,
                "destination_ranges"  jsonb,
                "target_tags"         jsonb,
                "disabled"            boolean      NOT NULL DEFAULT false,
                "creation_timestamp"  TIMESTAMP,
                "last_synced_at"      TIMESTAMP,
                "created_at"          TIMESTAMP    NOT NULL DEFAULT now(),
                "updated_at"          TIMESTAMP    NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_firewall_rules" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_firewall_rules_account_firewall" UNIQUE ("cloud_account_id", "gcp_firewall_id"),
                CONSTRAINT "FK_gcp_firewall_rules_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_gcp_firewall_rules_cloud_account_id"
            ON "gcp_firewall_rules" ("cloud_account_id")
        `);

        // ── gcp_storage_buckets ────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_storage_buckets" (
                "id"                           uuid         NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id"             uuid         NOT NULL,
                "gcp_bucket_id"                varchar(255) NOT NULL,
                "name"                         varchar(255) NOT NULL,
                "location"                     varchar(100) NOT NULL,
                "location_type"                varchar(30),
                "storage_class"                varchar(20)  NOT NULL,
                "versioning_enabled"           boolean      NOT NULL DEFAULT false,
                "public_access_prevention"     varchar(20),
                "uniform_bucket_level_access"  boolean      NOT NULL DEFAULT false,
                "labels"                       jsonb,
                "time_created"                 TIMESTAMP,
                "last_synced_at"               TIMESTAMP,
                "created_at"                   TIMESTAMP    NOT NULL DEFAULT now(),
                "updated_at"                   TIMESTAMP    NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_storage_buckets" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_storage_buckets_account_bucket" UNIQUE ("cloud_account_id", "gcp_bucket_id"),
                CONSTRAINT "FK_gcp_storage_buckets_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_gcp_storage_buckets_cloud_account_id"
            ON "gcp_storage_buckets" ("cloud_account_id")
        `);

        // ── gcp_sql_instances ──────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_sql_instances" (
                "id"                 uuid         NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id"   uuid         NOT NULL,
                "gcp_instance_id"    varchar(255) NOT NULL,
                "name"               varchar(255) NOT NULL,
                "database_version"   varchar(60)  NOT NULL,
                "region"             varchar(100) NOT NULL,
                "state"              varchar(30)  NOT NULL,
                "tier"               varchar(60),
                "ip_addresses"       jsonb,
                "disk_type"          varchar(20),
                "disk_size_gb"       integer,
                "backup_enabled"     boolean      NOT NULL DEFAULT false,
                "availability_type"  varchar(30),
                "user_labels"        jsonb,
                "create_time"        TIMESTAMP,
                "last_synced_at"     TIMESTAMP,
                "created_at"         TIMESTAMP    NOT NULL DEFAULT now(),
                "updated_at"         TIMESTAMP    NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_sql_instances" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_sql_instances_account_instance" UNIQUE ("cloud_account_id", "gcp_instance_id"),
                CONSTRAINT "FK_gcp_sql_instances_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_gcp_sql_instances_cloud_account_id"
            ON "gcp_sql_instances" ("cloud_account_id")
        `);

        // ── gcp_service_accounts ───────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_service_accounts" (
                "id"               uuid         NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id" uuid         NOT NULL,
                "gcp_unique_id"    varchar(30),
                "email"            varchar(255) NOT NULL,
                "display_name"     varchar(255),
                "description"      text,
                "disabled"         boolean      NOT NULL DEFAULT false,
                "last_synced_at"   TIMESTAMP,
                "created_at"       TIMESTAMP    NOT NULL DEFAULT now(),
                "updated_at"       TIMESTAMP    NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_service_accounts" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_service_accounts_account_email" UNIQUE ("cloud_account_id", "email"),
                CONSTRAINT "FK_gcp_service_accounts_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_gcp_service_accounts_cloud_account_id"
            ON "gcp_service_accounts" ("cloud_account_id")
        `);

        // ── gcp_gke_clusters ───────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "gcp_gke_clusters" (
                "id"                     uuid         NOT NULL DEFAULT gen_random_uuid(),
                "cloud_account_id"       uuid         NOT NULL,
                "gcp_cluster_id"         varchar(300) NOT NULL,
                "name"                   varchar(255) NOT NULL,
                "location"               varchar(100) NOT NULL,
                "status"                 varchar(30)  NOT NULL,
                "node_count"             integer,
                "current_master_version" varchar(30),
                "current_node_version"   varchar(30),
                "endpoint"               varchar(45),
                "network_name"           varchar(255),
                "subnetwork"             varchar(255),
                "logging_service"        varchar(100),
                "monitoring_service"     varchar(100),
                "resource_labels"        jsonb,
                "create_time"            TIMESTAMP,
                "last_synced_at"         TIMESTAMP,
                "created_at"             TIMESTAMP    NOT NULL DEFAULT now(),
                "updated_at"             TIMESTAMP    NOT NULL DEFAULT now(),
                CONSTRAINT "PK_gcp_gke_clusters" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_gcp_gke_clusters_account_cluster" UNIQUE ("cloud_account_id", "gcp_cluster_id"),
                CONSTRAINT "FK_gcp_gke_clusters_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_gcp_gke_clusters_cloud_account_id"
            ON "gcp_gke_clusters" ("cloud_account_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_gke_clusters"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_service_accounts"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_sql_instances"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_storage_buckets"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_firewall_rules"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_subnetworks"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_vpc_networks"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_vm_instances"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "gcp_assessment_jobs"`);
    }
}
