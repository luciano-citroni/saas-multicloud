import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
    constructor(private readonly schema: z.ZodSchema<T>) {}

    transform(value: unknown): T {
        const result = this.schema.safeParse(value);

        if (!result.success) {
            const issues = result.error.errors;
            const messages: string[] = [];
            const details: Record<string, string[]> = {};

            for (const issue of issues) {
                const path = issue.path && issue.path.length > 0 ? issue.path.join('.') : 'form';
                const msg = issue.message || 'Validation failed';
                messages.push(msg);
                if (!details[path]) details[path] = [];
                details[path].push(msg);
            }

            const finalMessage = messages.length === 1 ? messages[0] : messages;

            throw new BadRequestException({
                error: 'ValidationException',
                message: finalMessage,
                details,
            });
        }

        return result.data;
    }
}
