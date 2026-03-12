import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DescribeRepositoriesCommand, ListTagsForResourceCommand, type Repository as EcrRepository } from '@aws-sdk/client-ecr';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsEcrRepository } from '../../db/entites';

@Injectable()
export class AwsEcrService {
    private readonly logger = new Logger(AwsEcrService.name);

    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsEcrRepository)
        private readonly ecrRepository: Repository<AwsEcrRepository>
    ) {}

    async listRepositoriesFromDatabase(cloudAccountId: string) {
        return this.ecrRepository.find({ where: { cloudAccountId }, order: { repositoryName: 'ASC' } });
    }

    async getRepositoryById(repositoryId: string, cloudAccountId: string) {
        const repo = await this.ecrRepository.findOne({ where: { id: repositoryId, cloudAccountId } });
        if (!repo) {
            throw new BadRequestException(`Repositório ECR com ID "${repositoryId}" não encontrado.`);
        }
        return repo;
    }

    async syncRepositoriesFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getEcrClient(cloudAccountId, organizationId);

        const { repositories } = await client.send(new DescribeRepositoriesCommand({})).catch(() => {
            throw new BadRequestException('Falha ao listar repositórios ECR. Verifique as permissões da role (ecr:DescribeRepositories).');
        });

        if (!repositories || repositories.length === 0) {
            return [];
        }

        const now = new Date();
        const mapped: ReturnType<typeof mapAwsRepository>[] = [];

        for (const repo of repositories) {
            if (!repo.repositoryArn) continue;

            let tags: Record<string, string> = {};
            try {
                const { tags: rawTags } = await client.send(new ListTagsForResourceCommand({ resourceArn: repo.repositoryArn }));
                tags = rawTags?.reduce<Record<string, string>>((acc, t) => {
                    if (t.Key) acc[t.Key] = t.Value ?? '';
                    return acc;
                }, {}) ?? {};
            } catch {
                this.logger.debug(`Não foi possível obter tags do repositório ${repo.repositoryName}.`);
            }

            const repoData = mapAwsRepository(repo, tags);
            mapped.push(repoData);

            let dbRepo = await this.ecrRepository.findOne({ where: { repositoryArn: repoData.repositoryArn } });

            if (dbRepo) {
                dbRepo.repositoryName = repoData.repositoryName;
                dbRepo.repositoryUri = repoData.repositoryUri;
                dbRepo.registryId = repoData.registryId;
                dbRepo.imageTagMutability = repoData.imageTagMutability;
                dbRepo.scanOnPush = repoData.scanOnPush;
                dbRepo.encryptionType = repoData.encryptionType;
                dbRepo.encryptionKmsKey = repoData.encryptionKmsKey;
                dbRepo.tags = tags;
                dbRepo.lastSyncedAt = now;
            } else {
                dbRepo = this.ecrRepository.create({
                    cloudAccountId,
                    ...repoData,
                    tags,
                    lastSyncedAt: now,
                });
            }

            await this.ecrRepository.save(dbRepo);
        }

        return mapped;
    }
}

function mapAwsRepository(repo: EcrRepository, tags: Record<string, string>) {
    return {
        repositoryArn: repo.repositoryArn ?? '',
        repositoryName: repo.repositoryName ?? '',
        repositoryUri: repo.repositoryUri ?? null,
        registryId: repo.registryId ?? null,
        imageTagMutability: repo.imageTagMutability ?? null,
        scanOnPush: repo.imageScanningConfiguration?.scanOnPush ?? false,
        encryptionType: repo.encryptionConfiguration?.encryptionType ?? null,
        encryptionKmsKey: repo.encryptionConfiguration?.kmsKey ?? null,
        createdAtAws: repo.createdAt ?? null,
        tags,
    };
}
