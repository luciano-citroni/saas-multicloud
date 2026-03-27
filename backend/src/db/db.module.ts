import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            useFactory: async (configService: ConfigService) => {
                const dbTimezone = configService.get<string>('DB_TIMEZONE') ?? 'America/Sao_Paulo';

                return {
                    type: 'postgres',
                    host: configService.get<string>('DB_HOST'),
                    port: configService.get<number>('DB_PORT'),
                    username: configService.get<string>('DB_USERNAME'),
                    password: configService.get<string>('DB_PASSWORD'),
                    database: configService.get<string>('DB_NAME'),
                    entities: [__dirname + '/entites/**/*{.ts,.js}'],
                    migrations: [__dirname + '/migrations/*.ts', __dirname + '/migrations/*.js'],
                    synchronize: false,
                    extra: {
                        options: `-c timezone=${dbTimezone}`,
                    },
                };
            },
            inject: [ConfigService],
        }),
    ],
})
export class DbModule {}
