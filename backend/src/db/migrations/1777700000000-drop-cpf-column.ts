import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropCpfColumn1777700000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "cpf";`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN "cpf" VARCHAR(14) UNIQUE;
        `);
    }
}
