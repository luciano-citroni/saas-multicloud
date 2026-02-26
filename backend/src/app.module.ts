import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { ConfigModule } from '@nestjs/config';
import { OrganizationModule } from './organization/organization.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtGuard } from './auth/jwt.guard';
import { UserSession } from './db/entites/user-session.entity';

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true }), TypeOrmModule.forFeature([UserSession]), DbModule, OrganizationModule, UsersModule, AuthModule],
    controllers: [AppController],
    providers: [AppService, { provide: APP_GUARD, useClass: JwtGuard }],
})
export class AppModule {}
