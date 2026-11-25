import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Readable } from 'stream';
import { redactSensitiveData } from '../utils/redact-sensitive-data';

/**
 * Last-line defense: strip encrypted blobs / password hashes from JSON responses
 * even if a service accidentally returns a raw TypeORM entity.
 * Skips binary downloads (StreamableFile / Buffer / streams) so PDFs are not corrupted.
 */
@Injectable()
export class SensitiveResponseInterceptor implements NestInterceptor {
    intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(
            map((data) => {
                if (
                    data instanceof StreamableFile ||
                    data instanceof Readable ||
                    Buffer.isBuffer(data) ||
                    data instanceof Uint8Array ||
                    data instanceof ArrayBuffer
                ) {
                    return data;
                }
                return redactSensitiveData(data);
            }),
        );
    }
}
