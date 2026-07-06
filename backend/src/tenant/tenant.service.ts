import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantMember } from '../db/entites/tenant-member.entity';

@Injectable()
export class TenantService {
    constructor(
        @InjectRepository(TenantMember)
        private readonly memberRepo: Repository<TenantMember>
    ) {}

    async resolveMembership(userId: string, tenantId: string): Promise<TenantMember | null> {
        return this.memberRepo.findOne({
            where: { userId, tenantId },
            relations: ['tenant'],
        });
    }
}
