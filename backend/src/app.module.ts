import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { AutomationModule } from './automation/automation.module';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { FileStorageModule } from './file-storage/file-storage.module';
import { OrgsModule } from './orgs/orgs.module';
import { AiChatModule } from './ai-chat/ai-chat.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ScheduleModule.forRoot(),
        ThrottlerModule.forRoot([
            {
                // Limite global por tracker (user id ou IP). Endpoints sensíveis usam @Throttle mais baixo.
                name: 'default',
                ttl: 60_000,
                limit: 300,
            },
        ]),
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                // Prefixo isola filas quando REDIS é compartilhado (ex.: local vs container /app).
                // Sem isso, um worker remoto pode consumir jobs do Nest local e falhar com DB/código diferente.
                const prefix = config.get<string>('BULLMQ_PREFIX')?.trim() || undefined;

                const isProduction = config.get<string>('NODE_ENV') === 'production';
                const redisPassword = config.get<string>('REDIS_PASSWORD')?.trim();
                if (isProduction && !redisPassword) {
                    throw new Error('REDIS_PASSWORD is required when NODE_ENV=production');
                }

                return {
                    ...(prefix ? { prefix } : {}),
                    connection: {
                        host: config.get<string>('REDIS_HOST', 'localhost'),
                        port: config.get<number>('REDIS_PORT', 6379),
                        password: redisPassword || undefined,
                    },
                };
            },
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
        AutomationModule,
        AiChatModule,
        FileStorageModule,
        OrgsModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_GUARD, useClass: JwtGuard },
        { provide: APP_GUARD, useClass: UserThrottlerGuard },
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    ],
})
export class AppModule {}
