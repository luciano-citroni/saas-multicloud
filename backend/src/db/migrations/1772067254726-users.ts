import { MigrationInterface, QueryRunner } from "typeorm";

export class Users1772067254726 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "users" (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                email VARCHAR(255) not null,
                name VARCHAR(255) not null,
                password VARCHAR(255) not null,
                cpf VARCHAR(14) not null,
                isActive boolean DEFAULT true,
                createdAt TIMESTAMP DEFAULT now(),
                updatedAt TIMESTAMP DEFAULT now(),
                CONSTRAINT "UQ_users_email" UNIQUE (email),
                CONSTRAINT "UQ_users_cpf" UNIQUE (cpf)
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE IF EXISTS "users";
        `);
    }

}
