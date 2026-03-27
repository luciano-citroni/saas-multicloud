import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige o problema de upsert com region NULL na tabela finops_cost_records.
 *
 * O PostgreSQL trata NULL != NULL em constraints UNIQUE padrão, o que faz com
 * que registros com region = NULL nunca conflitem e sejam sempre inseridos como
 * novos, inflando os dados a cada sync.
 *
 * Solução:
 *  1. Remover a constraint UNIQUE antiga (que falha com NULL).
 *  2. Normalizar region NULL → '' em registros existentes.
 *  3. Alterar a coluna para NOT NULL DEFAULT ''.
 *  4. Recriar a constraint UNIQUE com region NOT NULL (funciona corretamente).
 *  5. Remover duplicatas geradas por syncs anteriores (mantém o registro mais recente).
 */
export class FinopsCostRecordFixRegion1777100000000 implements MigrationInterface {
    name = 'FinopsCostRecordFixRegion1777100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Remover constraint antiga
        await queryRunner.query(`
            ALTER TABLE "finops_cost_records"
            DROP CONSTRAINT IF EXISTS "uq_finops_cost_record"
        `);

        // 2. Normalizar NULLs existentes para string vazia
        await queryRunner.query(`
            UPDATE "finops_cost_records"
            SET "region" = ''
            WHERE "region" IS NULL
        `);

        // 3. Remover duplicatas geradas por syncs anteriores com region NULL.
        //    Mantém o registro com id maior (mais recente) para cada grupo único.
        await queryRunner.query(`
            DELETE FROM "finops_cost_records" a
            USING "finops_cost_records" b
            WHERE a."id" < b."id"
              AND a."cloud_account_id" = b."cloud_account_id"
              AND a."service"          = b."service"
              AND a."region"           = b."region"
              AND a."date"             = b."date"
              AND a."granularity"      = b."granularity"
        `);

        // 4. Alterar coluna para NOT NULL com default ''
        await queryRunner.query(`
            ALTER TABLE "finops_cost_records"
            ALTER COLUMN "region" SET NOT NULL,
            ALTER COLUMN "region" SET DEFAULT ''
        `);

        // 5. Recriar constraint UNIQUE — agora funciona porque não há mais NULLs
        await queryRunner.query(`
            ALTER TABLE "finops_cost_records"
            ADD CONSTRAINT "uq_finops_cost_record"
            UNIQUE ("cloud_account_id", "service", "region", "date", "granularity")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_cost_records"
            DROP CONSTRAINT IF EXISTS "uq_finops_cost_record"
        `);

        await queryRunner.query(`
            ALTER TABLE "finops_cost_records"
            ALTER COLUMN "region" DROP NOT NULL,
            ALTER COLUMN "region" DROP DEFAULT
        `);

        await queryRunner.query(`
            UPDATE "finops_cost_records"
            SET "region" = NULL
            WHERE "region" = ''
        `);

        await queryRunner.query(`
            ALTER TABLE "finops_cost_records"
            ADD CONSTRAINT "uq_finops_cost_record"
            UNIQUE ("cloud_account_id", "service", "region", "date", "granularity")
        `);
    }
}
