'use server';

import { extractErrorMessage, type ApiErrorResponse } from '@/lib/error-messages';
import { z } from 'zod';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4880';

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
 * Ação para registro
 * @param data - Dados de registro (name, email, password, confirmPassword)
 * @returns Resultado da ação com sucesso ou erro traduzido
 */
export async function registerAction(data: unknown): Promise<ActionResult> {
    try {
        // Validar dados
        const validatedData = registerSchema.parse(data);

        // Validar se as senhas coincidem
        if (validatedData.password !== validatedData.confirmPassword) {
            return {
                success: false,
                error: 'As senhas não coincidem',
            };
        }

        // Fazer requisição para o backend
        const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: validatedData.name,
                email: validatedData.email,
                password: validatedData.password,
            }),
        });

        const body = await response.json();

        if (!response.ok) {
            const errorMessage = extractErrorMessage(body as ApiErrorResponse);
            return {
                success: false,
                error: errorMessage,
            };
        }

        return {
            success: true,
            data: body,
        };
    } catch (error) {
        // Erro de validação
        if (error instanceof z.ZodError) {
            const firstError = error.issues[0];
            return {
                success: false,
                error: firstError.message,
            };
        }

        // Erro de rede ou outro erro
        return {
            success: false,
            error: 'Erro de conexão. Tente novamente.',
        };
    }
}
