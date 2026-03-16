import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrganizationModule } from './organization/organization.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtGuard } from './auth/jwt.guard';
import { UserSession } from './db/entites/user-session.entity';
import { CloudModule } from './cloud/cloud.module';
import { AwsModule } from './aws/aws.module';
import { TenantContextInterceptor } from './tenant/tenant-context.interceptor';
import { BillingModule } from './billing/billing.module';
import { PaginationMiddleware } from './common/middlewares/pagination.middleware';
import { PaginationInterceptor } from './common/interceptors/pagination.interceptor';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ScheduleModule.forRoot(),
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get<string>('REDIS_HOST', 'localhost'),
                    port: config.get<number>('REDIS_PORT', 6379),
                    password: config.get<string>('REDIS_PASSWORD') || undefined,
                },
            }),
        }),
        TypeOrmModule.forFeature([UserSession]),
        DbModule,
        OrganizationModule,
        UsersModule,
        AuthModule,
        CloudModule,
        AwsModule,
        BillingModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_GUARD, useClass: JwtGuard },
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
        { provide: APP_INTERCEPTOR, useClass: PaginationInterceptor },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(PaginationMiddleware).forRoutes({ path: '*', method: RequestMethod.GET });
    }
}
