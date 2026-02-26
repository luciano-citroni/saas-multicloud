import { MigrationInterface, QueryRunner } from "typeorm";

export class Organizations1772066965208 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "organizations" (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) not null,
                cnpj VARCHAR(20) not null,
                createdAt TIMESTAMP DEFAULT now(),
                updatedAt TIMESTAMP DEFAULT now(),
                CONSTRAINT "UQ_organizations_name" UNIQUE (name),
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
