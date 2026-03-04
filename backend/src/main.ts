import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import * as crypto from 'crypto';

// Polyfill para garantir que crypto esteja disponível globalmente
if (typeof globalThis.crypto === 'undefined') {
    (globalThis as any).crypto = crypto;
}

async function bootstrap() {
    // Configure global log level from environment (info, warn, error)
    type LogLevel = 'log' | 'warn' | 'error' | 'verbose' | 'debug' | 'fatal';
    const rawLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
    const levelMap: Record<'info' | 'warn' | 'error', LogLevel[]> = {
        info: ['log', 'warn', 'error'],
        warn: ['warn', 'error'],
        error: ['error'],
    };
    const levels = (levelMap[rawLevel as 'info' | 'warn' | 'error'] ?? levelMap['info']) as LogLevel[];

    const app = await NestFactory.create(AppModule, { logger: levels });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api');

    // Configuração Swagger
    const config = new DocumentBuilder()
        .setTitle('SaaS MultiCloud API')
        .setDescription('API de gerenciamento de usuários, organizações e autenticação')
        .setVersion('1.0')
        .addBearerAuth(
            {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
            'access-token'
        )
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
