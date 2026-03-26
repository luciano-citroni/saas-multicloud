import { MigrationInterface, QueryRunner } from 'typeorm';

export class AzureResources1776200000000 implements MigrationInterface {
    name = 'AzureResources1776200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "azure"`);

        // ── Shared helper: creates a standard azure resource table ────────────
        const createTable = async (table: string, extraCols = ''): Promise<void> => {
            await queryRunner.query(`
                CREATE TABLE IF NOT EXISTS "azure"."${table}" (
                    "id"              uuid         NOT NULL DEFAULT gen_random_uuid(),
                    "cloud_account_id" uuid        NOT NULL,
                    "azure_id"        text         NOT NULL,
                    "name"            varchar(255) NOT NULL,
                    "location"        varchar(100),
                    "resource_group"  varchar(255),
                    "subscription_id" varchar(36),
                    ${extraCols}
                    "tags"            jsonb,
                    "properties"      jsonb,
                    "last_synced_at"  TIMESTAMP,
                    "created_at"      TIMESTAMP    NOT NULL DEFAULT now(),
                    "updated_at"      TIMESTAMP    NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_azure_${table}" PRIMARY KEY ("id"),
                    CONSTRAINT "UQ_azure_${table}_account_azure_id" UNIQUE ("cloud_account_id", "azure_id"),
                    CONSTRAINT "FK_azure_${table}_cloud_account"
                        FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
                )
            `);
            await queryRunner.query(`
                CREATE INDEX IF NOT EXISTS "IDX_azure_${table}_cloud_account_id" ON "azure"."${table}" ("cloud_account_id")
            `);
        };

        // ── Subscriptions ──────────────────────────────────────────────────────
        await createTable('subscriptions', `"state" varchar(50),`);

        // ── Resource Groups ────────────────────────────────────────────────────
        await createTable('resource_groups');

        // ── Compute ────────────────────────────────────────────────────────────
        await createTable(
            'virtual_machines',
            `
            "vm_size"            varchar(100),
            "os_type"            varchar(20),
            "provisioning_state" varchar(50),
        `
        );

        await createTable(
            'vmss',
            `
            "sku"                varchar(100),
            "provisioning_state" varchar(50),
        `
        );

        await createTable(
            'aks_clusters',
            `
            "kubernetes_version" varchar(30),
            "provisioning_state" varchar(50),
        `
        );

        await createTable(
            'disks',
            `
            "disk_size_gb" int,
            "disk_state"   varchar(50),
            "sku"          varchar(50),
        `
        );

        // ── Web ────────────────────────────────────────────────────────────────
        await createTable(
            'web_apps',
            `
            "kind"  varchar(50),
            "state" varchar(20),
        `
        );

        await createTable(
            'app_service_plans',
            `
            "sku"  varchar(50),
            "kind" varchar(50),
        `
        );

        // ── Networking ─────────────────────────────────────────────────────────
        await createTable('virtual_networks', `"address_prefixes" text,`);

        await createTable(
            'network_interfaces',
            `
            "private_ip_address" varchar(50),
            "provisioning_state" varchar(50),
        `
        );

        await createTable(
            'public_ips',
            `
            "ip_address"        varchar(50),
            "allocation_method" varchar(20),
        `
        );

        await createTable('nsgs');

        await createTable('load_balancers', `"sku" varchar(50),`);

        await createTable(
            'application_gateways',
            `
            "sku"                varchar(50),
            "provisioning_state" varchar(50),
        `
        );

        // ── Storage ────────────────────────────────────────────────────────────
        await createTable(
            'storage_accounts',
            `
            "sku"  varchar(50),
            "kind" varchar(50),
        `
        );

        // ── Databases ──────────────────────────────────────────────────────────
        await createTable(
            'sql_servers',
            `
            "fully_qualified_domain_name" varchar(255),
            "administrator_login"         varchar(100),
        `
        );

        await createTable(
            'sql_databases',
            `
            "sku"    varchar(100),
            "status" varchar(50),
        `
        );

        await createTable(
            'postgres_servers',
            `
            "administrator_login" varchar(100),
            "version"             varchar(20),
        `
        );

        await createTable(
            'cosmos_db_accounts',
            `
            "database_account_offer_type" varchar(50),
            "document_endpoint"           varchar(255),
        `
        );

        // ── Security ───────────────────────────────────────────────────────────
        await createTable(
            'key_vaults',
            `
            "vault_uri" varchar(255),
            "sku"       varchar(50),
        `
        );

        await createTable('recovery_vaults', `"sku" varchar(50),`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const tables = [
            'subscriptions',
            'resource_groups',
            'virtual_machines',
            'vmss',
            'aks_clusters',
            'disks',
            'web_apps',
            'app_service_plans',
            'virtual_networks',
            'network_interfaces',
            'public_ips',
            'nsgs',
            'load_balancers',
            'application_gateways',
            'storage_accounts',
            'sql_servers',
            'sql_databases',
            'postgres_servers',
            'cosmos_db_accounts',
            'key_vaults',
            'recovery_vaults',
        ];

        for (const table of tables) {
            await queryRunner.query(`DROP TABLE IF EXISTS "azure"."${table}"`);
        }

        await queryRunner.query(`DROP SCHEMA IF EXISTS "azure"`);
    }
}
