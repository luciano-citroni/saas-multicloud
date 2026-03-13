import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillIamRoleColumns1776500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('aws_ec2_instances')) {
            if (!(await queryRunner.hasColumn('aws_ec2_instances', 'iam_instance_profile_arn'))) {
                await queryRunner.query(`ALTER TABLE "aws_ec2_instances" ADD COLUMN "iam_instance_profile_arn" character varying(512)`);
            }
            if (!(await queryRunner.hasColumn('aws_ec2_instances', 'iam_role_id'))) {
                await queryRunner.query(`ALTER TABLE "aws_ec2_instances" ADD COLUMN "iam_role_id" uuid`);
            }
        }

        if (await queryRunner.hasTable('aws_ecs_task_definitions')) {
            if (!(await queryRunner.hasColumn('aws_ecs_task_definitions', 'execution_role_id'))) {
                await queryRunner.query(`ALTER TABLE "aws_ecs_task_definitions" ADD COLUMN "execution_role_id" uuid`);
            }
            if (!(await queryRunner.hasColumn('aws_ecs_task_definitions', 'task_role_id'))) {
                await queryRunner.query(`ALTER TABLE "aws_ecs_task_definitions" ADD COLUMN "task_role_id" uuid`);
            }
        }

        if (await queryRunner.hasTable('aws_ecs_services')) {
            if (!(await queryRunner.hasColumn('aws_ecs_services', 'service_role_id'))) {
                await queryRunner.query(`ALTER TABLE "aws_ecs_services" ADD COLUMN "service_role_id" uuid`);
            }

            const schedulingStrategyTypeResult: Array<{ data_type: string }> = await queryRunner.query(
                `
                SELECT data_type
                FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND table_name = 'aws_ecs_services'
                    AND column_name = 'scheduling_strategy'
                `
            );

            if (schedulingStrategyTypeResult.length > 0 && schedulingStrategyTypeResult[0].data_type !== 'jsonb') {
                await queryRunner.query(
                    `
                    ALTER TABLE "aws_ecs_services"
                    ALTER COLUMN "scheduling_strategy"
                    TYPE jsonb
                    USING to_jsonb("scheduling_strategy")
                    `
                );
            }
        }

        if (!(await queryRunner.hasTable('aws_iam_roles'))) {
            return;
        }

        if ((await queryRunner.hasTable('aws_ec2_instances')) && (await queryRunner.hasColumn('aws_ec2_instances', 'iam_role_id'))) {
            await queryRunner.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'FK_a5551fcfc1694ce6f049b4b96e3'
                    ) THEN
                        ALTER TABLE "aws_ec2_instances"
                        ADD CONSTRAINT "FK_a5551fcfc1694ce6f049b4b96e3"
                        FOREIGN KEY ("iam_role_id") REFERENCES "aws_iam_roles"("id")
                        ON DELETE SET NULL ON UPDATE NO ACTION;
                    END IF;
                END
                $$;
            `);
        }

        if ((await queryRunner.hasTable('aws_ecs_task_definitions')) && (await queryRunner.hasColumn('aws_ecs_task_definitions', 'execution_role_id'))) {
            await queryRunner.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'FK_ccee558770484faf560bff1cd98'
                    ) THEN
                        ALTER TABLE "aws_ecs_task_definitions"
                        ADD CONSTRAINT "FK_ccee558770484faf560bff1cd98"
                        FOREIGN KEY ("execution_role_id") REFERENCES "aws_iam_roles"("id")
                        ON DELETE SET NULL ON UPDATE NO ACTION;
                    END IF;
                END
                $$;
            `);
        }

        if ((await queryRunner.hasTable('aws_ecs_task_definitions')) && (await queryRunner.hasColumn('aws_ecs_task_definitions', 'task_role_id'))) {
            await queryRunner.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'FK_0e379e543f362acad234d9f79ff'
                    ) THEN
                        ALTER TABLE "aws_ecs_task_definitions"
                        ADD CONSTRAINT "FK_0e379e543f362acad234d9f79ff"
                        FOREIGN KEY ("task_role_id") REFERENCES "aws_iam_roles"("id")
                        ON DELETE SET NULL ON UPDATE NO ACTION;
                    END IF;
                END
                $$;
            `);
        }

        if ((await queryRunner.hasTable('aws_ecs_services')) && (await queryRunner.hasColumn('aws_ecs_services', 'service_role_id'))) {
            await queryRunner.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'FK_d434eef28ad1430f7f01d098597'
                    ) THEN
                        ALTER TABLE "aws_ecs_services"
                        ADD CONSTRAINT "FK_d434eef28ad1430f7f01d098597"
                        FOREIGN KEY ("service_role_id") REFERENCES "aws_iam_roles"("id")
                        ON DELETE SET NULL ON UPDATE NO ACTION;
                    END IF;
                END
                $$;
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('aws_ecs_services')) {
            await queryRunner.query(`ALTER TABLE "aws_ecs_services" DROP CONSTRAINT IF EXISTS "FK_d434eef28ad1430f7f01d098597"`);
            await queryRunner.query(`ALTER TABLE "aws_ecs_services" DROP COLUMN IF EXISTS "service_role_id"`);
            await queryRunner.query(`
                ALTER TABLE "aws_ecs_services"
                ALTER COLUMN "scheduling_strategy"
                TYPE character varying(50)
                USING CASE
                    WHEN "scheduling_strategy" IS NULL THEN NULL
                    ELSE trim(both '"' from "scheduling_strategy"::text)
                END
            `);
        }

        if (await queryRunner.hasTable('aws_ecs_task_definitions')) {
            await queryRunner.query(`ALTER TABLE "aws_ecs_task_definitions" DROP CONSTRAINT IF EXISTS "FK_0e379e543f362acad234d9f79ff"`);
            await queryRunner.query(`ALTER TABLE "aws_ecs_task_definitions" DROP CONSTRAINT IF EXISTS "FK_ccee558770484faf560bff1cd98"`);
            await queryRunner.query(`ALTER TABLE "aws_ecs_task_definitions" DROP COLUMN IF EXISTS "task_role_id"`);
            await queryRunner.query(`ALTER TABLE "aws_ecs_task_definitions" DROP COLUMN IF EXISTS "execution_role_id"`);
        }

        if (await queryRunner.hasTable('aws_ec2_instances')) {
            await queryRunner.query(`ALTER TABLE "aws_ec2_instances" DROP CONSTRAINT IF EXISTS "FK_a5551fcfc1694ce6f049b4b96e3"`);
            await queryRunner.query(`ALTER TABLE "aws_ec2_instances" DROP COLUMN IF EXISTS "iam_role_id"`);
            await queryRunner.query(`ALTER TABLE "aws_ec2_instances" DROP COLUMN IF EXISTS "iam_instance_profile_arn"`);
        }
    }
}
