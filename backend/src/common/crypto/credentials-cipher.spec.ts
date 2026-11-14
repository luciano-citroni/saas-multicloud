import { decryptCredentialsJson, encryptCredentialsJson, maskSecret } from './credentials-cipher';

describe('credentials-cipher', () => {
    const keyHex = 'a'.repeat(64);

    it('encrypts and decrypts round-trip', () => {
        const payload = { apiKey: 'sk-test-1234567890', organizationId: 'org_1' };
        const encrypted = encryptCredentialsJson(payload, keyHex);
        expect(encrypted).not.toContain('sk-test');
        const decrypted = decryptCredentialsJson(encrypted, keyHex);
        expect(decrypted).toEqual(payload);
    });

    it('rejects invalid key length', () => {
        expect(() => encryptCredentialsJson({ a: 1 }, 'abcd')).toThrow('CREDENTIALS_ENCRYPTION_KEY_INVALID');
    });

    it('masks secrets', () => {
        expect(maskSecret('sk-proj-abcdefghijklmnop1234')).toMatch(/^sk-proj-/);
        expect(maskSecret('sk-proj-abcdefghijklmnop1234')).toContain('1234');
        expect(maskSecret('sk-proj-abcdefghijklmnop1234')).not.toContain('efghijklmnop');
    });
});
