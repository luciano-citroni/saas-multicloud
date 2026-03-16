import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

export function ApiPaginationQuery() {
    return applyDecorators(
        ApiQuery({
            name: 'page',
            required: false,
            type: Number,
            minimum: 1,
            example: 1,
            description: 'Numero da pagina (minimo 1).',
        }),
        ApiQuery({
            name: 'limit',
            required: false,
            type: Number,
            minimum: 1,
            maximum: 100,
            example: 25,
            description: 'Quantidade de itens por pagina (entre 1 e 100).',
        })
    );
}
