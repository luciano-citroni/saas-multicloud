import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { redactSensitiveData } from '../utils/redact-sensitive-data';

/**
 * Last-line defense: strip encrypted blobs / password hashes from JSON responses
 * even if a service accidentally returns a raw TypeORM entity.
 */
@Injectable()
export class SensitiveResponseInterceptor implements NestInterceptor {
    intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(map((data) => redactSensitiveData(data)));
    }
}
