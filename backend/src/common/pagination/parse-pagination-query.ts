import type { PaginationInput } from './paginate';

export function parsePaginationQuery(page?: string, limit?: string): PaginationInput {
    return {
        page: page ? Number.parseInt(page, 10) : undefined,
        limit: limit ? Number.parseInt(limit, 10) : undefined,
    };
}
