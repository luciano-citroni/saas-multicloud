import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudAccount, CloudProvider } from '../db/entites/cloud-account.entity';
import type { CreateCloudAccountDto } from './dto';
import * as crypto from 'crypto';

@Injectable()
export class CloudService {
    constructor(
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>
    ) {}

    /**
     * Criptografa as credenciais usando AES-256-GCM.
     * Formato: iv:authTag:ciphertext (em base64)
     */
    private encryptCredentials(credentials: Record<string, any>): string {
        const key = Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY || '0'.repeat(64), 'hex');
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
     * Descriptografa as credenciais.
     */
    private decryptCredentials(encrypted: string): Record<string, any> {
        try {
            const combined = Buffer.from(encrypted, 'base64').toString('hex');
            const [ivHex, authTagHex, ciphertext] = combined.split(':');

            const key = Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY || '0'.repeat(64), 'hex');
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
     * Cria uma nova conta de cloud vinculada à organização.
     */
    async createCloudAccount(organizationId: string, dto: CreateCloudAccountDto): Promise<Omit<CloudAccount, 'credentialsEncrypted'>> {
        // Validar o provider
        if (!Object.values(CloudProvider).includes(dto.provider as CloudProvider)) {
            throw new BadRequestException(`Provider inválido: ${dto.provider}`);
        }

        // Criptografar as credenciais
        const encryptedCredentials = this.encryptCredentials(dto.credentials);

        // Criar a conta
        const cloudAccount = this.cloudAccountRepository.create({
            organizationId,
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

    /**
     * Lista as contas de cloud de uma organização.
     */
    async findByOrganization(organizationId: string): Promise<Omit<CloudAccount, 'credentialsEncrypted'>[]> {
        const accounts = await this.cloudAccountRepository.find({
            where: { organizationId },
        });

        return accounts.map(({ credentialsEncrypted: _, ...acc }) => acc as Omit<CloudAccount, 'credentialsEncrypted'>);
    }

    /**
     * Obtém uma conta específica (com credenciais, se necessário).
     */
    async findByIdAndOrganization(id: string, organizationId: string, includeCredentials?: boolean): Promise<CloudAccount | null> {
        let query = this.cloudAccountRepository
            .createQueryBuilder('ca')
            .where('ca.id = :id', { id })
            .andWhere('ca.organizationId = :organizationId', { organizationId });

        if (includeCredentials) {
            query = query.addSelect('ca.credentialsEncrypted');
        }

        return query.getOne();
    }
}
