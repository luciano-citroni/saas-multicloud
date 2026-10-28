import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

function encryptionKey(keyHex: string): Buffer {
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
        throw new InternalServerErrorException('CREDENTIALS_ENCRYPTION_KEY inválida: deve ter 32 bytes (64 hex chars)');
    }
    return key;
}

export function encryptJson(value: unknown, keyHex: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(keyHex), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const combined = `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
    return Buffer.from(combined).toString('base64');
}

export function decryptJson(payload: string, keyHex: string): unknown {
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const [ivHex, tagHex, dataHex] = decoded.split(':');
    if (!ivHex || !tagHex || !dataHex) {
        throw new InternalServerErrorException('Parâmetros criptografados inválidos');
    }
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(keyHex), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    return JSON.parse(plain) as unknown;
}

@Injectable()
export class ParameterCipher {
    constructor(private readonly configService: ConfigService) {}

    encrypt(value: unknown): string {
        const keyHex = this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY');
        if (!keyHex) throw new InternalServerErrorException('CREDENTIALS_ENCRYPTION_KEY não configurada');
        return encryptJson(value, keyHex);
    }

    decrypt(payload: string): unknown {
        const keyHex = this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY');
        if (!keyHex) throw new InternalServerErrorException('CREDENTIALS_ENCRYPTION_KEY não configurada');
        return decryptJson(payload, keyHex);
    }
}
