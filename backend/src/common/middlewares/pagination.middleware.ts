import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export type RequestWithPagination = Request & {
    pagination?: {
        page: number;
        limit: number;
    };
};

@Injectable()
export class PaginationMiddleware implements NestMiddleware {
    use(req: RequestWithPagination, _res: Response, next: NextFunction): void {
        const page = this.toPositiveInt(req.query.page, DEFAULT_PAGE);
        const requestedLimit = this.toPositiveInt(req.query.limit, DEFAULT_LIMIT);

        req.pagination = {
            page,
            limit: Math.min(requestedLimit, MAX_LIMIT),
        };

        next();
    }

    private toPositiveInt(value: unknown, fallback: number): number {
        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed < 1) {
            return fallback;
        }

        return parsed;
    }
}
