import { MigrationInterface, QueryRunner } from 'typeorm';

export class Organizations1772066965208 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "organizations" (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) not null,
                cnpj VARCHAR(20) null,
                created_at TIMESTAMP DEFAULT now(),
                updated_at TIMESTAMP DEFAULT now(),
                CONSTRAINT "UQ_organizations_cnpj" UNIQUE (cnpj)
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE IF EXISTS "organizations";
        `);
    }
}
