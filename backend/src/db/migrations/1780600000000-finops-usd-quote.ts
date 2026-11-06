import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsUsdQuote1780600000000 implements MigrationInterface {
    name = 'FinopsUsdQuote1780600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_usd_quotes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "quoted_on" date NOT NULL,
                "brl_per_usd" numeric(12,6) NOT NULL,
                "pct_change" numeric(10,6),
                "quoted_at" varchar(32),
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_usd_quotes" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_usd_quotes_day"
            ON "finops_usd_quotes" ("quoted_on")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_usd_quotes_day"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_usd_quotes"`);
    }
}
