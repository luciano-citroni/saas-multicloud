import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import * as crypto from 'crypto';
import helmet from 'helmet';

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

    const app = await NestFactory.create(AppModule, { logger: levels, rawBody: true });
    const expressApp = app.getHttpAdapter().getInstance();

    expressApp.disable('x-powered-by');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api');
    app.use(
        helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false,
        })
    );
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }

            try {
                const requestOrigin = new URL(origin);
                const frontendUrl = process.env.FRONTEND_URL;

                if (frontendUrl && requestOrigin.origin === new URL(frontendUrl).origin) {
                    callback(null, true);
                    return;
                }

                const isLocalhostInDevelopment = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(requestOrigin.hostname);

                callback(isLocalhostInDevelopment ? null : new Error('Not allowed by CORS'), isLocalhostInDevelopment);
            } catch {
                callback(new Error('Not allowed by CORS'), false);
            }
        },
        credentials: true,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type'],
    });

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
