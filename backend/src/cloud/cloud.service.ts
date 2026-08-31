import { Injectable, BadRequestException, ForbiddenException, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, In, QueryFailedError, Repository } from 'typeorm';

import { InjectQueue } from '@nestjs/bullmq';

import { Queue } from 'bullmq';

import { CloudAccount, CloudProvider } from '../db/entites/cloud-account.entity';

import type { CreateCloudAccountDto, ListCloudAccountsQueryDto, UpdateCloudAccountDto } from './dto';

import * as crypto from 'crypto';

import { BillingService } from '../billing/billing.service';

import { CloudConnectionService } from './cloud-connection.service';

import { ErrorMessages } from '../common/messages/error-messages';

import { AzureAssessmentJob } from '../db/entites/azure-assessment-job.entity';
import { CloudSyncJob } from '../db/entites/cloud-sync-job.entity';

import { GENERAL_SYNC_JOB_NAME, GENERAL_SYNC_QUEUE } from '../aws/assessment/constants';
import { GCP_GENERAL_SYNC_JOB_NAME, GCP_GENERAL_SYNC_QUEUE } from '../gcp/assessment/constants';

type CloudAccountWithSyncStatus = Omit<CloudAccount, 'credentialsEncrypted'> & {
    isSyncInProgress: boolean;
    lastGeneralSyncError: string | null;
    lastGeneralSyncWarning: string | null;
};

type CloudAccountSyncFeedback = {
    error: string | null;
    warning: string | null;
};

@Injectable()
export class CloudService {
    private readonly logger = new Logger(CloudService.name);
    private readonly awsRegionRegex = /^[a-z]{2}(?:-(?:gov|iso|isob|isof))?-[a-z0-9-]+-\d+$/i;

    constructor(
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,

        private readonly dataSource: DataSource,

        @InjectRepository(AzureAssessmentJob)
        private readonly azureAssessmentJobRepository: Repository<AzureAssessmentJob>,

        @InjectRepository(CloudSyncJob)
        private readonly syncJobRepository: Repository<CloudSyncJob>,

        @InjectQueue(GENERAL_SYNC_QUEUE)
        private readonly generalSyncQueue: Queue,

        @InjectQueue(GCP_GENERAL_SYNC_QUEUE)
        private readonly gcpGeneralSyncQueue: Queue,

        private readonly configService: ConfigService,

        private readonly billingService: BillingService,

        private readonly cloudConnectionService: CloudConnectionService
    ) {}

    private normalizeAwsCredentials(credentials: Record<string, any>): Record<string, any> {
        const regionFromField = typeof credentials.region === 'string' ? credentials.region.trim().toLowerCase() : '';

        const regionsFromField = Array.isArray(credentials.regions)
            ? credentials.regions
                  .filter((region): region is string => typeof region === 'string')
                  .flatMap((region) => region.split(/[\n,;]/))
                  .map((region) => region.trim().toLowerCase())
            : [];

        const mergedRegions = [regionFromField, ...regionsFromField].filter((region) => region.length > 0);

        const uniqueRegions = Array.from(new Set(mergedRegions));

        if (uniqueRegions.length === 0) {
            throw new BadRequestException({
                error: 'ValidationException',

                message: 'Credencial AWS inválida: informe "region" ou "regions" com ao menos uma região.',

                details: { field: 'credentials.region' },
            });
        }

        return {
            ...credentials,

            region: uniqueRegions[0],

            regions: uniqueRegions,
        };
    }

    /**


     * Criptografa as credenciais usando AES-256-GCM.


     *


     * Descrição:


     * - Usa uma chave hex (32 bytes / 64 hex chars) presente em


     *   `process.env.CREDENTIALS_ENCRYPTION_KEY`.


     * - Gera um `iv` aleatório de 16 bytes.


     * - O payload armazenado tem o formato: `ivHex:authTagHex:ciphertextHex`,


     *   todo este string é então codificado em base64 para persistência.


     *


     * Observação de segurança: garanta que `CREDENTIALS_ENCRYPTION_KEY` seja


     * gerida com segurança (ex.: secret manager, variáveis de ambiente do


     * runtime) e tenha exatamente 64 caracteres hexadecimais (32 bytes).


     *


     * @param credentials Objeto contendo as credenciais a serem criptografadas


     * @returns string Base64 com o conteúdo combinado (`iv:authTag:ciphertext`)


     */

    private encryptCredentials(credentials: Record<string, any>): string {
        const keyHex = this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY');

        if (!keyHex) {
            throw new InternalServerErrorException('CREDENTIALS_ENCRYPTION_KEY não configurada');
        }

        const key = Buffer.from(keyHex, 'hex');

        if (key.length !== 32) {
            throw new InternalServerErrorException('CREDENTIALS_ENCRYPTION_KEY inválida: deve ter 32 bytes (64 hex chars)');
        }

        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

        const credentialsJson = JSON.stringify(credentials);

        let encrypted = cipher.update(credentialsJson, 'utf8', 'hex');

        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        const combined = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

        return Buffer.from(combined).toString('base64');
    }

    /**


     * Descriptografa as credenciais previamente criptografadas por


     * `encryptCredentials`.


     *


     * O método espera receber a string base64 produzida por


     * `encryptCredentials` e devolve o objeto original.


     *


     * @param encrypted String base64 com `ivHex:authTagHex:ciphertextHex`


     * @throws BadRequestException em caso de falha na descriptografia


     * @returns Record<string, any> Objeto de credenciais desserializado


     */

    private decryptCredentials(encrypted: string): Record<string, any> {
        try {
            // Decodifica a base64 para recuperar o formato textual "ivHex:authTagHex:ciphertextHex"

            const combined = Buffer.from(encrypted, 'base64').toString('utf8');

            const [ivHex, authTagHex, ciphertext] = combined.split(':');

            const keyHex = this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY');

            if (!keyHex) {
                throw new InternalServerErrorException('CREDENTIALS_ENCRYPTION_KEY não configurada');
            }

            const key = Buffer.from(keyHex, 'hex');

            if (key.length !== 32) {
                throw new InternalServerErrorException('CREDENTIALS_ENCRYPTION_KEY inválida: deve ter 32 bytes (64 hex chars)');
            }

            const iv = Buffer.from(ivHex, 'hex');

            const authTag = Buffer.from(authTagHex, 'hex');

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(ciphertext, 'hex', 'utf8');

            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);
        } catch (error) {
            throw new BadRequestException('Falha ao descriptografar as credenciais');
        }
    }

    /**


     * Valida as credenciais com base no provider.


     */

    private validateCredentialsForProvider(provider: CloudProvider, credentials: Record<string, any>): void {
        if (provider === CloudProvider.AWS) {
            if (!credentials.roleArn || typeof credentials.roleArn !== 'string') {
                throw new BadRequestException({
                    error: 'ValidationException',

                    message: 'Credencial AWS inválida: campo "roleArn" ausente ou inválido.',

                    details: { field: 'credentials.roleArn' },
                });
            }

            const hasValidRegion = typeof credentials.region === 'string' && credentials.region.trim() !== '';

            const hasValidRegions = Array.isArray(credentials.regions) && credentials.regions.length > 0;

            if (!hasValidRegion && !hasValidRegions) {
                throw new BadRequestException({
                    error: 'ValidationException',

                    message: 'Credencial AWS inválida: informe "region" ou "regions".',

                    details: { field: 'credentials.region' },
                });
            }

            if (hasValidRegion && !this.awsRegionRegex.test(credentials.region.trim())) {
                throw new BadRequestException({
                    error: 'ValidationException',

                    message: 'Credencial AWS inválida: "region" está em formato inválido (ex: us-east-1).',

                    details: { field: 'credentials.region' },
                });
            }

            if (hasValidRegions) {
                const invalidRegion = credentials.regions.find(
                    (region: unknown) => typeof region !== 'string' || !this.awsRegionRegex.test(region.trim())
                );

                if (invalidRegion) {
                    throw new BadRequestException({
                        error: 'ValidationException',

                        message: 'Credencial AWS inválida: "regions" contém valor inválido (ex: us-east-1).',

                        details: { field: 'credentials.regions' },
                    });
                }
            }

            if (credentials.externalId && typeof credentials.externalId !== 'string') {
                throw new BadRequestException({
                    error: 'ValidationException',

                    message: 'Credencial AWS inválida: campo "externalId" deve ser uma string.',

                    details: { field: 'credentials.externalId' },
                });
            }
        }

        if (provider === CloudProvider.GCP) {
            if (!credentials.projectId || typeof credentials.projectId !== 'string' || credentials.projectId.trim().length === 0) {
                throw new BadRequestException({
                    error: 'ValidationException',
                    message: 'Credencial GCP inválida: campo "projectId" ausente ou inválido.',
                    details: { field: 'credentials.projectId' },
                });
            }

            const gcpProjectIdRegex = /^[a-z][a-z0-9\-]{4,28}[a-z0-9]$/;

            if (!gcpProjectIdRegex.test(credentials.projectId.trim())) {
                throw new BadRequestException({
                    error: 'ValidationException',
                    message: 'Credencial GCP inválida: "projectId" deve ter 6-30 caracteres, iniciar com letra minúscula (ex: meu-projeto-123).',
                    details: { field: 'credentials.projectId' },
                });
            }

            if (
                !credentials.serviceAccountEmail ||
                typeof credentials.serviceAccountEmail !== 'string' ||
                credentials.serviceAccountEmail.trim().length === 0
            ) {
                throw new BadRequestException({
                    error: 'ValidationException',
                    message: 'Credencial GCP inválida: campo "serviceAccountEmail" ausente ou inválido.',
                    details: { field: 'credentials.serviceAccountEmail' },
                });
            }

            const gcpSaEmailRegex = /^.+@.+\.iam\.gserviceaccount\.com$/;

            if (!gcpSaEmailRegex.test(credentials.serviceAccountEmail.trim())) {
                throw new BadRequestException({
                    error: 'ValidationException',
                    message:
                        'Credencial GCP inválida: "serviceAccountEmail" deve ser uma Service Account GCP válida (ex: sa@projeto.iam.gserviceaccount.com).',
                    details: { field: 'credentials.serviceAccountEmail' },
                });
            }
        }
    }

    /**


     * Cria uma nova conta de cloud vinculada à organização.


     */

    async createCloudAccount(tenantId: string, dto: CreateCloudAccountDto): Promise<Omit<CloudAccount, 'credentialsEncrypted'>> {
        try {
            const plan = await this.billingService.getActivePlanForOrganization(tenantId);

            if (plan.metadata.maxCloudAccounts > 0) {
                const currentAccountsCount = await this.cloudAccountRepository.count({ where: { tenantId } });

                if (currentAccountsCount >= plan.metadata.maxCloudAccounts) {
                    throw new ForbiddenException(ErrorMessages.PLANS.CLOUD_ACCOUNT_LIMIT_REACHED);
                }
            }
        } catch (err) {
            if (err instanceof ForbiddenException) throw err;
            this.logger.warn(`Plan limit check skipped for tenant ${tenantId} (billing not ready): ${err instanceof Error ? err.message : String(err)}`);
        }

        // Validar o provider

        if (!Object.values(CloudProvider).includes(dto.provider as CloudProvider)) {
            throw new BadRequestException({
                error: 'ValidationException',

                message: `Provider inválido: ${dto.provider}`,

                details: { field: 'provider' },
            });
        }

        const normalizedCredentials = dto.provider === CloudProvider.AWS ? this.normalizeAwsCredentials(dto.credentials) : { ...dto.credentials };

        // Validar credenciais específicas do provider

        this.validateCredentialsForProvider(dto.provider as CloudProvider, normalizedCredentials);

        await this.cloudConnectionService.verify(dto.provider as CloudProvider, normalizedCredentials);

        // Criptografar as credenciais

        const encryptedCredentials = this.encryptCredentials(normalizedCredentials);

        // Criar a conta

        const cloudAccount = this.cloudAccountRepository.create({
            tenantId,

            organizationId: dto.organizationId ?? null,

            provider: dto.provider as CloudProvider,

            alias: dto.alias,

            credentialsEncrypted: encryptedCredentials,

            isActive: true,
        });

        const savedAccount = await this.cloudAccountRepository.save(cloudAccount);

        // Remover as credenciais da resposta

        const { credentialsEncrypted: _, ...result } = savedAccount;

        return result as Omit<CloudAccount, 'credentialsEncrypted'>;
    }

    async getAccountForEdit(tenantId: string, id: string): Promise<Omit<CloudAccount, 'credentialsEncrypted'> & { credentials: Record<string, any> }> {
        const account = await this.findByIdAndTenant(id, tenantId, true);

        if (!account) {
            throw new NotFoundException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }

        const credentials = this.decryptCredentials(account.credentialsEncrypted);
        const { credentialsEncrypted: _, ...result } = account;
        const syncMetadata = await this.getSyncMetadataForAccounts([id]);

        return {
            ...(result as Omit<CloudAccount, 'credentialsEncrypted'>),
            credentials,
            ...syncMetadata[id],
        };
    }

    async updateCloudAccount(tenantId: string, id: string, dto: UpdateCloudAccountDto): Promise<Omit<CloudAccount, 'credentialsEncrypted'>> {
        const existingAccount = await this.findByIdAndTenant(id, tenantId, true);

        if (!existingAccount) {
            throw new NotFoundException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }

        if (dto.alias !== undefined) {
            existingAccount.alias = dto.alias;
        }

        if (dto.credentials !== undefined) {
            const normalizedCredentials = existingAccount.provider === CloudProvider.AWS ? this.normalizeAwsCredentials(dto.credentials) : dto.credentials;

            this.validateCredentialsForProvider(existingAccount.provider, normalizedCredentials);
            await this.cloudConnectionService.verify(existingAccount.provider, normalizedCredentials);
            existingAccount.credentialsEncrypted = this.encryptCredentials(normalizedCredentials);
        }

        if (dto.isActive !== undefined) {
            existingAccount.isActive = dto.isActive;
        }

        if (dto.organizationId !== undefined) {
            existingAccount.organizationId = dto.organizationId;
        }

        const updatedAccount = await this.cloudAccountRepository.save(existingAccount);
        const { credentialsEncrypted: _, ...result } = updatedAccount;

        return result as Omit<CloudAccount, 'credentialsEncrypted'>;
    }

    async deleteCloudAccount(tenantId: string, id: string): Promise<{ id: string; deleted: true }> {
        const existingAccount = await this.findByIdAndTenant(id, tenantId, true);

        if (!existingAccount) {
            throw new NotFoundException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const tablesWithCloudAccountId = (await queryRunner.query(
                `
                    SELECT c.table_schema AS "tableSchema", c.table_name AS "tableName"
                    FROM information_schema.columns c
                    INNER JOIN information_schema.tables t
                        ON t.table_schema = c.table_schema
                        AND t.table_name = c.table_name
                    WHERE c.column_name = 'cloud_account_id'
                      AND c.table_name <> 'cloud_accounts'
                      AND c.table_schema = 'public'
                      AND t.table_type = 'BASE TABLE'
                    ORDER BY c.table_name ASC
                `
            )) as Array<{ tableSchema: string; tableName: string }>;

            for (const table of tablesWithCloudAccountId) {
                const schemaName = this.quoteIdentifier(table.tableSchema);
                const tableName = this.quoteIdentifier(table.tableName);
                await queryRunner.query(`DELETE FROM ${schemaName}.${tableName} WHERE cloud_account_id = $1`, [id]);
            }

            await queryRunner.manager.delete(CloudAccount, { id, tenantId });

            await queryRunner.commitTransaction();
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }

        return { id, deleted: true };
    }

    private quoteIdentifier(identifier: string): string {
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    /**


     * Lista as contas de cloud de uma organização.


     */

    async findByOrganization(tenantId: string, filters?: Pick<ListCloudAccountsQueryDto, 'name' | 'isActive'>): Promise<CloudAccountWithSyncStatus[]> {
        const queryBuilder = this.cloudAccountRepository.createQueryBuilder('cloudAccount').where('cloudAccount.tenant_id = :tenantId', { tenantId });

        if (filters?.name) {
            queryBuilder.andWhere('cloudAccount.alias ILIKE :name', { name: `%${filters.name}%` });
        }

        if (filters?.isActive === 'true' || filters?.isActive === 'false') {
            queryBuilder.andWhere('cloudAccount.is_active = :isActive', { isActive: filters.isActive === 'true' });
        }

        const accounts = await queryBuilder.orderBy('cloudAccount.alias', 'ASC').getMany();

        const accountIds = accounts.map((account) => account.id);

        if (accountIds.length === 0) {
            return [];
        }

        const [awsSyncingAccountIds, azureSyncingAccountIds, gcpSyncingAccountIds, latestSyncFeedback] = await Promise.all([
            this.findAwsAccountsWithSyncInProgress(accountIds),
            this.findAzureAccountsWithSyncInProgress(accountIds),
            this.findGcpAccountsWithSyncInProgress(accountIds),
            this.findLatestSyncFeedback(accountIds),
        ]);

        const syncMetadata = this.buildSyncMetadata(accountIds, awsSyncingAccountIds, azureSyncingAccountIds, gcpSyncingAccountIds, latestSyncFeedback);

        return accounts.map(({ credentialsEncrypted: _, ...acc }) => ({
            ...acc,
            ...syncMetadata[acc.id],
        }));
    }

    private async getSyncMetadataForAccounts(accountIds: string[]): Promise<Record<string, Omit<CloudAccountWithSyncStatus, keyof Omit<CloudAccount, 'credentialsEncrypted'>>>> {
        if (accountIds.length === 0) {
            return {};
        }

        const [awsSyncingAccountIds, azureSyncingAccountIds, gcpSyncingAccountIds, latestSyncFeedback] = await Promise.all([
            this.findAwsAccountsWithSyncInProgress(accountIds),
            this.findAzureAccountsWithSyncInProgress(accountIds),
            this.findGcpAccountsWithSyncInProgress(accountIds),
            this.findLatestSyncFeedback(accountIds),
        ]);

        return this.buildSyncMetadata(accountIds, awsSyncingAccountIds, azureSyncingAccountIds, gcpSyncingAccountIds, latestSyncFeedback);
    }

    private buildSyncMetadata(
        accountIds: string[],
        awsSyncingAccountIds: Set<string>,
        azureSyncingAccountIds: Set<string>,
        gcpSyncingAccountIds: Set<string>,
        latestSyncFeedback: Record<string, CloudAccountSyncFeedback>
    ): Record<string, Pick<CloudAccountWithSyncStatus, 'isSyncInProgress' | 'lastGeneralSyncError' | 'lastGeneralSyncWarning'>> {
        return Object.fromEntries(
            accountIds.map((accountId) => {
                const feedback = latestSyncFeedback[accountId] ?? { error: null, warning: null };

                return [
                    accountId,
                    {
                        isSyncInProgress:
                            awsSyncingAccountIds.has(accountId) || azureSyncingAccountIds.has(accountId) || gcpSyncingAccountIds.has(accountId),
                        lastGeneralSyncError: feedback.error,
                        lastGeneralSyncWarning: feedback.warning,
                    },
                ];
            })
        );
    }

    private async findLatestSyncFeedback(accountIds: string[]): Promise<Record<string, CloudAccountSyncFeedback>> {
        const jobs = await this.syncJobRepository.find({
            where: { cloudAccountId: In(accountIds) },
            order: { createdAt: 'DESC' },
            select: ['cloudAccountId', 'status', 'error'],
        });

        const latestByAccount = new Map<string, Pick<CloudSyncJob, 'status' | 'error'>>();

        for (const job of jobs) {
            if (!latestByAccount.has(job.cloudAccountId)) {
                latestByAccount.set(job.cloudAccountId, { status: job.status, error: job.error });
            }
        }

        const result: Record<string, CloudAccountSyncFeedback> = {};

        for (const [accountId, latest] of latestByAccount) {
            if (latest.status === 'failed' && latest.error) {
                result[accountId] = { error: latest.error, warning: null };
                continue;
            }

            if (latest.status === 'completed' && latest.error) {
                result[accountId] = { error: null, warning: latest.error };
            }
        }

        return result;
    }

    private async findAwsAccountsWithSyncInProgress(accountIds: string[]): Promise<Set<string>> {
        const jobs = await this.generalSyncQueue.getJobs(['active', 'waiting', 'prioritized', 'delayed', 'paused'], 0, 199, false);

        const syncingIds = new Set<string>();
        const accountIdsSet = new Set(accountIds);

        for (const job of jobs) {
            const jobCloudAccountId = (job.data as { cloudAccountId?: string }).cloudAccountId;

            if (job.name === GENERAL_SYNC_JOB_NAME && jobCloudAccountId && accountIdsSet.has(jobCloudAccountId)) {
                syncingIds.add(jobCloudAccountId);
            }
        }

        await this.clearStalePersistedSyncFlags(accountIds, syncingIds, CloudProvider.AWS);

        return syncingIds;
    }

    private async findAzureAccountsWithSyncInProgress(accountIds: string[]): Promise<Set<string>> {
        try {
            const runningAzureJobs = await this.azureAssessmentJobRepository.find({
                select: ['cloudAccountId'],
                where: {
                    cloudAccountId: In(accountIds),
                    status: In(['pending', 'running']),
                },
            });

            return new Set(runningAzureJobs.map((job) => job.cloudAccountId));
        } catch (error) {
            const dbCode = error instanceof QueryFailedError ? ((error as QueryFailedError & { code?: string }).code ?? undefined) : undefined;

            // Em ambientes sem a migration Azure aplicada, ignora o lookup para não derrubar /cloud/accounts.
            if (dbCode === '42P01') {
                return new Set<string>();
            }

            throw error;
        }
    }

    private async findGcpAccountsWithSyncInProgress(accountIds: string[]): Promise<Set<string>> {
        const jobs = await this.gcpGeneralSyncQueue.getJobs(['active', 'waiting', 'prioritized', 'delayed', 'paused'], 0, 199, false);

        const syncingIds = new Set<string>();
        const accountIdsSet = new Set(accountIds);

        for (const job of jobs) {
            const jobCloudAccountId = (job.data as { cloudAccountId?: string }).cloudAccountId;

            if (job.name === GCP_GENERAL_SYNC_JOB_NAME && jobCloudAccountId && accountIdsSet.has(jobCloudAccountId)) {
                syncingIds.add(jobCloudAccountId);
            }
        }

        await this.clearStalePersistedSyncFlags(accountIds, syncingIds, CloudProvider.GCP);

        return syncingIds;
    }

    private async clearStalePersistedSyncFlags(accountIds: string[], syncingIds: Set<string>, provider: CloudProvider): Promise<void> {
        const persistedSyncingAccounts = await this.cloudAccountRepository.find({
            select: ['id'],
            where: {
                id: In(accountIds),
                provider,
                isGeneralSyncInProgress: true,
            },
        });

        const staleSyncingIds = persistedSyncingAccounts.map((account) => account.id).filter((accountId) => !syncingIds.has(accountId));

        if (staleSyncingIds.length > 0) {
            await this.cloudAccountRepository.update({ id: In(staleSyncingIds) }, { isGeneralSyncInProgress: false });
        }
    }

    /**


     * Retorna as credenciais descriptografadas de uma conta de cloud.


     * Valida que a conta pertence à organização antes de expor as credenciais.


     *


     * @throws NotFoundException se a conta não for encontrada ou não pertencer à org


     */

    async getDecryptedCredentials(id: string, tenantId: string): Promise<Record<string, any>> {
        const account = await this.findByIdAndTenant(id, tenantId, true);

        if (!account) {
            throw new BadRequestException({
                error: 'NotFoundException',

                message: 'Conta de cloud não encontrada',
            });
        }

        return this.decryptCredentials(account.credentialsEncrypted);
    }

    /**


     * Obtém uma conta específica (com credenciais, se necessário).


     */

    async findByIdAndTenant(id: string, tenantId: string, includeCredentials?: boolean): Promise<CloudAccount | null> {
        let query = this.cloudAccountRepository

            .createQueryBuilder('ca')

            .where('ca.id = :id', { id })

            .andWhere('ca.tenantId = :tenantId', { tenantId });

        if (includeCredentials) {
            query = query.addSelect('ca.credentialsEncrypted');
        }

        return query.getOne();
    }

    async findByIdAndOrganization(id: string, organizationId: string, includeCredentials?: boolean): Promise<CloudAccount | null> {
        return this.findByIdAndTenant(id, organizationId, includeCredentials);
    }
}
