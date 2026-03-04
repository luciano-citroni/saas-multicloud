import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudAccount, CloudProvider } from '../db/entites/cloud-account.entity';
import type { CreateCloudAccountDto } from './dto';
import * as crypto from 'crypto';

@Injectable()
export class CloudService {
    constructor(
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,
        private readonly configService: ConfigService
    ) {}

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
        const keyHex = this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY') || '0'.repeat(64);
        const key = Buffer.from(keyHex, 'hex');
        if (key.length !== 32) {
            throw new Error('CREDENTIALS_ENCRYPTION_KEY inválida: deve ter 32 bytes (64 hex chars)');
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

            const keyHex = this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY') || '0'.repeat(64);
            const key = Buffer.from(keyHex, 'hex');
            if (key.length !== 32) {
                throw new Error('CREDENTIALS_ENCRYPTION_KEY inválida: deve ter 32 bytes (64 hex chars)');
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
