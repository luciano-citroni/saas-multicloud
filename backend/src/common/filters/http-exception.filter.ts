import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const normalized = this.normalizeException(exception);
        this.logException(exception, normalized, request);

        response.status(normalized.statusCode).json({
            statusCode: normalized.statusCode,
            error: normalized.error,
            message: normalized.message,
            path: request.url,
            timestamp: new Date().toISOString(),
        });
    }

    private logException(exception: unknown, normalized: { statusCode: number; error: string; message: string | string[] }, request: Request) {
        const context = {
            statusCode: normalized.statusCode,
            error: normalized.error,
            message: normalized.message,
            method: request.method,
            path: request.url,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
        };

        if (normalized.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
            this.logger.error(context, exception instanceof Error ? exception.stack : undefined);
            return;
        }

        this.logger.warn(context);
    }

    private normalizeException(exception: unknown): {
        statusCode: number;
        error: string;
        message: string | string[];
    } {
        if (exception instanceof HttpException) {
            const response = exception.getResponse();
            const statusCode = exception.getStatus();
            const errorName = exception.name;

            if (typeof response === 'string') {
                return {
                    statusCode,
                    error: errorName,
                    message: response,
                };
            }

            if (typeof response === 'object' && response !== null) {
                const payload = response as {
                    message?: string | string[];
                    error?: string;
                };

                return {
                    statusCode,
                    error: payload.error ?? errorName,
                    message: payload.message ?? exception.message,
                };
            }
        }

        if (exception instanceof QueryFailedError) {
            const normalized = this.normalizeQueryFailedError(exception);

            return normalized;
        }

        return {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            error: 'InternalServerError',
            message: 'Unexpected error',
        };
    }

    private normalizeQueryFailedError(exception: QueryFailedError): {
        statusCode: number;
        error: string;
        message: string;
    } {
        const error = exception as QueryFailedError & {
            code?: string;
            detail?: string;
        };

        if (error.code === '23505') {
            let message = 'This value is already in use';

            if (error.detail) {
                if (error.detail.includes('email')) {
                    message = 'This email is already in use';
                } else if (error.detail.includes('cpf')) {
                    message = 'This CPF is already in use';
                } else if (error.detail.includes('cnpj')) {
                    message = 'This CNPJ is already in use';
                }
            }

            return {
                statusCode: HttpStatus.CONFLICT,
                error: 'Conflict',
                message,
            };
        }

        if (error.code === '23503') {
            return {
                statusCode: HttpStatus.BAD_REQUEST,
                error: 'BadRequest',
                message: 'Invalid reference: the referenced record does not exist',
            };
        }

        return {
            statusCode: HttpStatus.BAD_REQUEST,
            error: 'DatabaseError',
            message: 'Database constraint violation',
        };
    }
}
