import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { DEFAULT_LIMIT, DEFAULT_PAGE, RequestWithPagination } from '../middlewares/pagination.middleware';

@Injectable()
export class PaginationInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest<RequestWithPagination>();

        if (request?.method !== 'GET') {
            return next.handle();
        }

        return next.handle().pipe(
            map((response) => {
                if (!Array.isArray(response)) {
                    return response;
                }

                const page = request.pagination?.page ?? DEFAULT_PAGE;
                const limit = request.pagination?.limit ?? DEFAULT_LIMIT;
                const totalItems = response.length;
                const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
                const safePage = totalPages === 0 ? DEFAULT_PAGE : Math.min(page, totalPages);
                const start = (safePage - 1) * limit;
                const items = response.slice(start, start + limit);

                return {
                    items,
                    pagination: {
                        page: safePage,
                        limit,
                        totalItems,
                        totalPages,
                        hasNextPage: safePage < totalPages,
                        hasPreviousPage: safePage > DEFAULT_PAGE,
                    },
                };
            })
        );
    }
}
