import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
    constructor(private readonly schema: z.ZodSchema<T>) {}

    transform(value: unknown): T {
        const result = this.schema.safeParse(value);

        if (!result.success) {
            const errors = result.error.flatten();
            const messages: string[] = [];

            // Extrair mensagens de erro dos campos
            if (errors.fieldErrors) {
                Object.values(errors.fieldErrors).forEach((fieldErrors) => {
                    if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
                        messages.push(...fieldErrors);
                    }
                });
            }

            // Se houver erros de formulário genéricos, adicionar também
            if (Array.isArray(errors.formErrors) && errors.formErrors.length > 0) {
                messages.push(...errors.formErrors);
            }

            // Se não houver mensagens específicas, usar a mensagem padrão
            const finalMessage = messages.length > 0 ? messages : ['Validation failed'];

            throw new BadRequestException({
                message: finalMessage.length === 1 ? finalMessage[0] : finalMessage,
                error: 'ValidationException',
            });
        }

        return result.data;
    }
}
