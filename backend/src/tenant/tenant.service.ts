import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationMember } from '../db/entites/organization-member.entity';

/**
 * Serviço responsável pela resolução do contexto de tenant.
 *
 * Encapsula o acesso ao banco para que o TenantGuard não dependa
 * diretamente dos repositórios — evitando o erro de DI cross-module.
 *
 * Para escala: adicione cache Redis aqui com TTL de 30–60s.
 *   Chave: `membership:{userId}:{orgId}`
 *   Invalidação: ao alterar/remover o membership.
 */
@Injectable()
export class TenantService {
    constructor(
        @InjectRepository(OrganizationMember)
        private readonly memberRepo: Repository<OrganizationMember>
    ) {}

    /**
     * Retorna o membership com a organization carregada via JOIN.
     * Retorna null se o usuário não pertencer à organização.
     */
    async resolveMembership(userId: string, organizationId: string): Promise<OrganizationMember | null> {
        return this.memberRepo.findOne({
            where: { userId, organizationId },
            relations: ['organization'],
        });
    }
}
