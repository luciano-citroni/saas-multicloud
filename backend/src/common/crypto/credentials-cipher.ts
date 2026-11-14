import * as crypto from 'crypto';

/**
 * AES-256-GCM helpers shared by cloud accounts and AI FinOps BYOK credentials.
 * Stored format: Base64(ivHex:authTagHex:ciphertextHex).
 */
export function encryptCredentialsJson(credentials: Record<string, unknown>, keyHex: string): string {
    if (!keyHex) {
        throw new Error('CREDENTIALS_ENCRYPTION_KEY_MISSING');
    }

    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
        throw new Error('CREDENTIALS_ENCRYPTION_KEY_INVALID');
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

export function decryptCredentialsJson(encrypted: string, keyHex: string): Record<string, unknown> {
    if (!keyHex) {
        throw new Error('CREDENTIALS_ENCRYPTION_KEY_MISSING');
    }

    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
        throw new Error('CREDENTIALS_ENCRYPTION_KEY_INVALID');
    }

    const combined = Buffer.from(encrypted, 'base64').toString('utf8');
    const [ivHex, authTagHex, ciphertext] = combined.split(':');
    if (!ivHex || !authTagHex || !ciphertext) {
        throw new Error('CREDENTIALS_PAYLOAD_INVALID');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted) as Record<string, unknown>;
}

export function maskSecret(value: string, visibleTail = 4): string {
    if (!value) return '';
    if (value.length <= visibleTail) return '*'.repeat(Math.max(value.length, 8));
    const prefix = value.slice(0, Math.min(8, value.length - visibleTail));
    return `${prefix}${'*'.repeat(16)}${value.slice(-visibleTail)}`;
}
