import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Restringe queries de agregação ao nível serviço/região (resource_id vazio),
 * evitando double-count com linhas de drill-down por recurso.
 */
export function andWhereServiceLevelCost<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias = 'r',
): SelectQueryBuilder<T> {
    return qb.andWhere(`(${alias}.resourceId = :finopsEmptyResourceId OR ${alias}.resourceId IS NULL)`, {
        finopsEmptyResourceId: '',
    });
}

export function andWhereResourceLevelCost<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias = 'r',
): SelectQueryBuilder<T> {
    return qb.andWhere(`${alias}.resourceId IS NOT NULL`).andWhere(`${alias}.resourceId != :finopsEmptyResourceId`, {
        finopsEmptyResourceId: '',
    });
}
