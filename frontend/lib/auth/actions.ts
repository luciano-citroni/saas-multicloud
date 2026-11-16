'use server';

import { extractErrorMessage, type ApiErrorResponse } from '@/lib/error-messages';
import { z } from 'zod';

/**
 * Esquema de validação para registro
 */
const registerSchema = z.object({
    name: z.string().min(3, 'O nome deve conter no mínimo 3 caracteres'),
    email: z.email('E-mail inválido'),
    password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
    confirmPassword: z.string(),
});

/**
 * Resultado padronizado de uma ação
 */
interface ActionResult<T = null> {
    success: boolean;
    error?: string;
    data?: T;
}

/**
 * @deprecated Prefer client fetch to `/api/auth/register` (BFF + CSRF).
 * Kept for compatibility; still avoids calling the Nest URL from the browser.
 */
export async function registerAction(data: unknown): Promise<ActionResult> {
    try {
        const validatedData = registerSchema.parse(data);

        if (validatedData.password !== validatedData.confirmPassword) {
            return {
                success: false,
                error: 'As senhas não coincidem',
            };
        }

        // Server Actions run on the server — call same-origin BFF via absolute backend URL is avoided.
        // Callers should use `/api/auth/register` from the client. This path is a safe fallback
        // that still goes through Nest only from the server process.
        const { getBackendInternalUrl } = await import('@/lib/auth/session');
        const backendUrl = getBackendInternalUrl();

        const response = await fetch(`${backendUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: validatedData.name,
                email: validatedData.email,
                password: validatedData.password,
            }),
        });

        if (!response.ok) {
            const body = await response.json().catch(() => null);
            return {
                success: false,
                error: extractErrorMessage((body ?? {}) as ApiErrorResponse),
            };
        }

        await response.json().catch(() => null);

        return { success: true };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: error.issues[0]?.message ?? 'Dados inválidos',
            };
        }

        return {
            success: false,
            error: 'Erro de conexão. Tente novamente.',
        };
    }
}
