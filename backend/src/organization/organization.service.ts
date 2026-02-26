import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../db/entites';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';
import { ErrorMessages } from '../common/messages/error-messages';

@Injectable()
export class OrganizationService {
    constructor(
        @InjectRepository(Organization)
        private readonly organizationRepository: Repository<Organization>
    ) {}

    async create(payload: CreateOrganizationDto): Promise<Organization> {
        const organization = this.organizationRepository.create(payload);

        return this.organizationRepository.save(organization);
    }

    async findAll(): Promise<Organization[]> {
        return this.organizationRepository.find();
    }

    async findOne(id: string): Promise<Organization> {
        const organization = await this.organizationRepository.findOne({ where: { id } });

        if (!organization) {
            throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);
        }

        return organization;
    }

    async update(id: string, payload: UpdateOrganizationDto): Promise<Organization> {
        const organization = await this.organizationRepository.preload({ id, ...payload });

        if (!organization) {
            throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);
        }

        return this.organizationRepository.save(organization);
    }

    async remove(id: string): Promise<{ id: string; deleted: true }> {
        const organization = await this.findOne(id);

        await this.organizationRepository.remove(organization);

        return { id, deleted: true };
    }
}
