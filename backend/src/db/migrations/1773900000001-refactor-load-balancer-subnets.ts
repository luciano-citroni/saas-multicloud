import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class RefactorLoadBalancerSubnets1773900000001 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Remover a tabela aws_load_balancer_subnets
        await queryRunner.dropTable('aws_load_balancer_subnets');

        // 2. Adicionar coluna de subnet_ids na tabela aws_load_balancers
        await queryRunner.addColumn(
            'aws_load_balancers',
            new TableColumn({
                name: 'subnet_ids',
                type: 'uuid[]',
                isNullable: true,
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove a coluna subnet_ids
        await queryRunner.dropColumn('aws_load_balancers', 'subnet_ids');

        // Recria a tabela aws_load_balancer_subnets
        await queryRunner.query(`
            CREATE TABLE "aws_load_balancer_subnets" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "load_balancer_id" uuid NOT NULL,
                "subnet_id" uuid NOT NULL,
                "availability_zone" varchar(50) NOT NULL,
                "aws_subnet_id" varchar(50) NOT NULL,
                "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("id"),
                CONSTRAINT "FK_e73998ef26c2530e80d655e2b9f" FOREIGN KEY ("load_balancer_id") REFERENCES "aws_load_balancers"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_3027a3942932c97bc2b4da308ad" FOREIGN KEY ("subnet_id") REFERENCES "aws_subnets"("id") ON DELETE CASCADE
            )
        `);

        // Recriar indexes
        await queryRunner.createIndex(
            'aws_load_balancer_subnets',
            new TableIndex({
                name: 'idx_aws_load_balancer_subnets_lb_id',
                columnNames: ['load_balancer_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_load_balancer_subnets',
            new TableIndex({
                name: 'idx_aws_load_balancer_subnets_subnet_id',
                columnNames: ['subnet_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_load_balancer_subnets',
            new TableIndex({
                name: 'idx_aws_load_balancer_subnets_unique',
                columnNames: ['load_balancer_id', 'subnet_id'],
                isUnique: true,
            })
        );
    }
}
