import { isBlockedSensitiveKey, redactSensitiveData } from './redact-sensitive-data';

describe('redactSensitiveData', () => {
    it('removes password and encrypted credential fields', () => {
        const redacted = redactSensitiveData({
            id: '1',
            email: 'a@b.com',
            password: '$2b$12$abc',
            credentialsEncrypted: 'blob',
            credentials: { clientId: 'x', clientSecret: 'keep-flag-path', hasClientSecret: true },
            nested: { encryptedValue: 'secret', name: 'ok' },
        });

        expect(redacted).toEqual({
            id: '1',
            email: 'a@b.com',
            credentials: { clientId: 'x', clientSecret: 'keep-flag-path', hasClientSecret: true },
            nested: { name: 'ok' },
        });
    });

    it('keeps auth tokens and Stripe clientSecret for BFF/Stripe.js', () => {
        const redacted = redactSensitiveData({
            accessToken: 'jwt',
            refreshToken: 'opaque',
            clientSecret: 'seti_secret',
        });

        expect(redacted).toEqual({
            accessToken: 'jwt',
            refreshToken: 'opaque',
            clientSecret: 'seti_secret',
        });
    });

    it('detects blocked keys with snake_case and camelCase', () => {
        expect(isBlockedSensitiveKey('credentials_encrypted')).toBe(true);
        expect(isBlockedSensitiveKey('successorToken')).toBe(true);
        expect(isBlockedSensitiveKey('failedLoginAttempts')).toBe(true);
        expect(isBlockedSensitiveKey('locked_until')).toBe(true);
        expect(isBlockedSensitiveKey('email')).toBe(false);
    });
});
