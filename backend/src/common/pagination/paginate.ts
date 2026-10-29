import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '../middlewares/pagination.middleware';

export type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

export type PaginatedResult<T> = {
    items: T[];
    pagination: PaginationMeta;
};

export type PaginationInput = {
    page?: number;
    limit?: number;
};

export function normalizePagination(input: PaginationInput = {}): { page: number; limit: number } {
    const page = Number.isInteger(input.page) && (input.page as number) > 0 ? (input.page as number) : DEFAULT_PAGE;
    const requestedLimit = Number.isInteger(input.limit) && (input.limit as number) > 0 ? (input.limit as number) : DEFAULT_LIMIT;

    return {
        page,
        limit: Math.min(requestedLimit, MAX_LIMIT),
    };
}

export function buildPaginationMeta(totalItems: number, page: number, limit: number): PaginationMeta {
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
    const safePage = totalPages === 0 ? DEFAULT_PAGE : Math.min(page, totalPages);

    return {
        page: safePage,
        limit,
        totalItems,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > DEFAULT_PAGE,
    };
}

export async function paginateQuery<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    input: PaginationInput = {}
): Promise<PaginatedResult<T>> {
    const { page, limit } = normalizePagination(input);
    const totalItems = await qb.getCount();
    const pagination = buildPaginationMeta(totalItems, page, limit);
    const items = await qb
        .skip((pagination.page - 1) * limit)
        .take(limit)
        .getMany();

    return { items, pagination };
}

export async function paginateRepositoryFindAndCount<T>(
    findAndCount: () => Promise<[T[], number]>,
    input: PaginationInput = {}
): Promise<PaginatedResult<T>> {
    const { page, limit } = normalizePagination(input);
    const [items, totalItems] = await findAndCount();
    return {
        items,
        pagination: buildPaginationMeta(totalItems, page, limit),
    };
}
