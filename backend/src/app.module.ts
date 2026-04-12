import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { AzureModule } from './azure/azure.module';
import { TenantContextInterceptor } from './tenant/tenant-context.interceptor';
import { BillingModule } from './billing/billing.module';
import { GovernanceModule } from './governance/governance.module';
import { FinopsModule } from './finops/finops.module';
import { GcpModule } from './gcp/gcp.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ScheduleModule.forRoot(),
        ThrottlerModule.forRoot([
            {
                // Limite global padrão: 120 req por minuto por IP
                name: 'default',
                ttl: 60_000,
                limit: 120,
            },
            {
                // Limite estrito para endpoints de autenticação: 10 req por minuto por IP
                name: 'auth',
                ttl: 60_000,
                limit: 10,
            },
        ]),
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
        AzureModule,
        BillingModule,
        GovernanceModule,
        FinopsModule,
        GcpModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtGuard },
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    ],
})
export class AppModule {}
