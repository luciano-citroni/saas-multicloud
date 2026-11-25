import { StreamableFile } from '@nestjs/common';
import { Readable } from 'stream';

/**
 * Deep-redacts fields that must never appear in API responses or client-facing payloads.
 * Intentionally does NOT strip Stripe SetupIntent `clientSecret` or auth `accessToken`/`refreshToken`
 * (those are required by the BFF / Stripe.js). Encrypted blobs and password hashes are always removed.
 *
 * Binary / stream responses (PDF downloads, zip exports) must pass through untouched —
 * walking Object.entries on StreamableFile turns it into a plain object and corrupts the file.
 */

const BLOCKED_KEY =
    /^(password|passwordhash|credentialsencrypted|encryptedvalue|parametersencrypted|keyhash|successortoken|previoustokenhash|tokenhash|privatekey|private_key|secretaccesskey|secret_access_key|masteruserpassword|rawapikey|failedloginattempts|lockeduntil)$/i;

const BLOCKED_SUBSTRING =
    /credentialsencrypted|encryptedvalue|parametersencrypted|successortoken|previoustokenhash|privatekey|secretaccesskey|masteruserpassword|failedloginattempts|lockeduntil/i;

export function isBlockedSensitiveKey(key: string): boolean {
    const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return BLOCKED_KEY.test(normalized) || BLOCKED_SUBSTRING.test(normalized);
}

function isBinaryOrStreamPayload(value: object): boolean {
    return (
        value instanceof StreamableFile ||
        value instanceof Readable ||
        Buffer.isBuffer(value) ||
        value instanceof Uint8Array ||
        value instanceof ArrayBuffer
    );
}

export function redactSensitiveData<T>(value: T, depth = 0): T {
    if (depth > 12 || value == null) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => redactSensitiveData(item, depth + 1)) as T;
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === 'object') {
        if (isBinaryOrStreamPayload(value)) {
            return value;
        }

        const input = value as Record<string, unknown>;
        const output: Record<string, unknown> = {};

        for (const [key, child] of Object.entries(input)) {
            if (isBlockedSensitiveKey(key)) {
                continue;
            }
            output[key] = redactSensitiveData(child, depth + 1);
        }

        return output as T;
    }

    return value;
}
