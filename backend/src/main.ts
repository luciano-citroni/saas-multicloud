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
    const isProduction = process.env.NODE_ENV === 'production';

    const expressApp = app.getHttpAdapter().getInstance();

    // Aumentar timeout para 600 segundos (10 minutos) para permitir sync + geração de relatório
    expressApp.set('trust proxy', 1);

    expressApp.disable('x-powered-by');

    // Aumentar timeout padrão do Express para 600 segundos (10 minutos)
    expressApp.set('query parser', 'simple');
    expressApp.use((req, res, next) => {
        // 600 segundos para endpoints de download/relatório, 60s para outros
        const timeout = req.path.includes('/download') || req.path.includes('/report') ? 600000 : 60000;
        req.setTimeout(timeout);
        res.setTimeout(timeout);
        next();
    });

    app.useGlobalFilters(new HttpExceptionFilter());

    app.setGlobalPrefix('api');

    app.use(
        helmet({
            // Em produção mantemos CSP habilitado; em dev pode ser desabilitado para facilitar debugging local.
            contentSecurityPolicy: isProduction ? undefined : false,
            crossOriginEmbedderPolicy: false,
            referrerPolicy: { policy: 'no-referrer' },
        })
    );

    app.enableCors({
        origin: (origin, callback) => {
            // Top-level navigations (Google OAuth start/callback), health checks and
            // server-to-server calls often omit Origin. Rejecting them with an Error
            // becomes a 500 and breaks OAuth redirects in production.
            if (!origin) {
                callback(null, true);
                return;
            }

            try {
                const requestOrigin = new URL(origin).origin;
                const allowedOrigins = [process.env.FRONTEND_URL, process.env.GOOGLE_ALLOWED_REDIRECT_ORIGINS]
                    .filter((value): value is string => Boolean(value?.trim()))
                    .flatMap((value) => value.split(','))
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0)
                    .map((value) => {
                        try {
                            return new URL(value).origin;
                        } catch {
                            return null;
                        }
                    })
                    .filter((value): value is string => Boolean(value));

                if (allowedOrigins.includes(requestOrigin)) {
                    callback(null, true);
                    return;
                }

                const isLocalhostInDevelopment = !isProduction && ['localhost', '127.0.0.1'].includes(new URL(origin).hostname);
                callback(null, isLocalhostInDevelopment);
            } catch {
                callback(null, false);
            }
        },

        credentials: true,

        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],

        allowedHeaders: ['Authorization', 'Content-Type', 'x-organization-id'],
    });

    // Swagger — desabilitado em produção
    if (process.env.NODE_ENV !== 'production') {
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
    }

    const server = await app.listen(process.env.PORT ?? 3000);

    // Configurar timeout global do HTTP server para 10 minutos
    server.setTimeout(600000);
    server.headersTimeout = 610000; // Ligeiramente mais alto que setTimeout
}

bootstrap();
