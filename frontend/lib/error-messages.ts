/**
 * Mensagens de erro mapeadas da API com traduções para o frontend
 * Mantém sincronização com backend/src/common/messages/error-messages.ts
 */

export const ErrorMessages = {
    // Auth
    AUTH: {
        EMAIL_ALREADY_REGISTERED: {
            en: 'This email is already in use',
            pt: 'Este e-mail já está sendo usado',
        },
        CPF_ALREADY_REGISTERED: {
            en: 'This CPF is already in use',
            pt: 'Este CPF já está sendo usado',
        },
        INVALID_CREDENTIALS: {
            en: 'Invalid email or password',
            pt: 'E-mail ou senha inválidos',
        },
        ACCOUNT_INACTIVE: {
            en: 'This account is inactive',
            pt: 'Esta conta está inativa',
        },
        INVALID_REFRESH_TOKEN: {
            en: 'Invalid or expired refresh token',
            pt: 'Token de atualização inválido ou expirado',
        },
        INVALID_OR_EXPIRED_TOKEN: {
            en: 'Token is invalid or expired',
            pt: 'Token inválido ou expirado',
        },
    },

    // Users
    USERS: {
        NOT_FOUND: {
            en: 'User not found',
            pt: 'Usuário não encontrado',
        },
        EMAIL_ALREADY_IN_USE: {
            en: 'This email is already in use',
            pt: 'Este e-mail já está sendo usado',
        },
        CPF_ALREADY_IN_USE: {
            en: 'This CPF is already in use',
            pt: 'Este CPF já está sendo usado',
        },
        CANNOT_DELETE_WHILE_IN_ORGANIZATION: {
            en: 'You cannot delete your account while you are a member of an organization',
            pt: 'Você não pode deletar sua conta enquanto é membro de uma organização',
        },
    },

    // Organizations
    ORGANIZATIONS: {
        NOT_FOUND: {
            en: 'Organization not found',
            pt: 'Organização não encontrada',
        },
        CNPJ_ALREADY_IN_USE: {
            en: 'This CNPJ is already in use',
            pt: 'Este CNPJ já está sendo usado',
        },
        OWNER_CANNOT_LEAVE: {
            en: 'The organization owner cannot leave without transferring ownership or deleting the organization.',
            pt: 'O owner não pode sair da organização sem antes transferir a propriedade ou excluí-la.',
        },
    },

    // Organization members
    MEMBERS: {
        NOT_FOUND: {
            en: 'Member not found in this organization',
            pt: 'Membro não encontrado nesta organização',
        },
        CANNOT_REMOVE_OWNER: {
            en: 'The organization owner cannot be removed',
            pt: 'O proprietário da organização não pode ser removido',
        },
        CANNOT_REMOVE_SELF: {
            en: 'You cannot remove yourself from the organization this way',
            pt: 'Você não pode remover a si mesmo da organização desta forma',
        },
        CANNOT_CHANGE_OWNER_ROLE: {
            en: 'The role of the organization owner cannot be changed',
            pt: 'O cargo do proprietário da organização não pode ser alterado',
        },
        CANNOT_PROMOTE_TO_OWNER: {
            en: 'Only the owner can transfer ownership',
            pt: 'Apenas o proprietário pode transferir propriedade',
        },
        INSUFFICIENT_ROLE_TO_MODIFY: {
            en: 'You can only manage members with a lower role than yours',
            pt: 'Você só pode gerenciar membros com uma função inferior à sua',
        },
    },

    // Organization invites
    INVITES: {
        NOT_FOUND: {
            en: 'Invite not found or has already been used',
            pt: 'Convite não encontrado ou já foi usado',
        },
        EXPIRED: {
            en: 'This invite has expired',
            pt: 'Este convite expirou',
        },
        ALREADY_ACCEPTED: {
            en: 'This invite has already been accepted',
            pt: 'Este convite já foi aceito',
        },
        USER_ALREADY_MEMBER: {
            en: 'This user is already a member of the organization',
            pt: 'Este usuário já é membro da organização',
        },
        USER_NOT_REGISTERED: {
            en: 'No account found with this email. Please register before accepting the invite',
            pt: 'Nenhuma conta encontrada com este e-mail. Registre-se antes de aceitar o convite',
        },
    },

    // Tenant context (multi-tenancy)
    TENANT: {
        MISSING_HEADER: {
            en: 'Missing organization context. Send the "x-organization-id" header',
            pt: 'Contexto de organização ausente. Envie o cabeçalho "x-organization-id"',
        },
        INVALID_ORG_ID: {
            en: 'Invalid organization ID format',
            pt: 'Formato inválido de ID da organização',
        },
        NO_ACCESS: {
            en: 'You do not have access to this organization or it does not exist',
            pt: 'Você não tem acesso a esta organização ou ela não existe',
        },
    },

    // RBAC (roles)
    RBAC: {
        INSUFFICIENT_PERMISSIONS: {
            en: 'You do not have permission to perform this action',
            pt: 'Você não tem permissão para realizar esta ação',
        },
        MISSING_MEMBERSHIP: {
            en: 'No organization membership found in request context',
            pt: 'Nenhuma filiação organizacional encontrada no contexto da solicitação',
        },
    },

    // Cloud accounts
    CLOUD_ACCOUNTS: {
        NOT_FOUND: {
            en: 'Cloud account not found',
            pt: 'Conta cloud não encontrada',
        },
        ALIAS_ALREADY_IN_USE: {
            en: 'A cloud account with this alias already exists in the organization',
            pt: 'Uma conta cloud com este alias já existe na organização',
        },
        INVALID_PROVIDER: {
            en: 'Invalid cloud provider. Supported: aws, azure, gcp',
            pt: 'Provedor cloud inválido. Suportado: aws, azure, gcp',
        },
    },

    // Database
    DATABASE: {
        CONFLICT: {
            en: 'This value is already in use',
            pt: 'Este valor já está sendo usado',
        },
        FOREIGN_KEY_VIOLATION: {
            en: 'Invalid reference: the referenced record does not exist',
            pt: 'Referência inválida: o registro referenciado não existe',
        },
        CONSTRAINT_VIOLATION: {
            en: 'Database constraint violation',
            pt: 'Violação de restrição do banco de dados',
        },
    },

    // Validation
    VALIDATION: {
        INVALID_EMAIL: {
            en: 'Invalid email format',
            pt: 'Formato de e-mail inválido',
        },
        INVALID_CPF: {
            en: 'Invalid CPF',
            pt: 'CPF inválido',
        },
        INVALID_CNPJ: {
            en: 'Invalid CNPJ',
            pt: 'CNPJ inválido',
        },
        PASSWORD_REQUIREMENTS: {
            en: 'Password must be at least 8 characters with uppercase, lowercase, number and special character',
            pt: 'A senha deve ter pelo menos 8 caracteres com maiúsculas, minúsculas, número e caractere especial',
        },
    },

    // General (mapeado por HTTP status code)
    GENERAL: {
        UNEXPECTED_ERROR: {
            en: 'An unexpected error occurred',
            pt: 'Um erro inesperado ocorreu',
        },
        BAD_REQUEST: {
            en: 'Invalid request',
            pt: 'Solicitação inválida',
        },
        UNAUTHORIZED: {
            en: 'Unauthorized access',
            pt: 'Acesso não autorizado',
        },
        FORBIDDEN: {
            en: 'Access forbidden',
            pt: 'Acesso prohibido',
        },
        NOT_FOUND: {
            en: 'Resource not found',
            pt: 'Recurso não encontrado',
        },
        CONFLICT: {
            en: 'Resource conflict',
            pt: 'Conflito de recurso',
        },
        INTERNAL_SERVER_ERROR: {
            en: 'Internal server error',
            pt: 'Erro interno do servidor',
        },
    },
} as const;

/**
 * Tipo para inferir as chaves de erro
 */
export type ErrorKey =
    | `AUTH.${keyof typeof ErrorMessages.AUTH}`
    | `USERS.${keyof typeof ErrorMessages.USERS}`
    | `ORGANIZATIONS.${keyof typeof ErrorMessages.ORGANIZATIONS}`
    | `MEMBERS.${keyof typeof ErrorMessages.MEMBERS}`
    | `INVITES.${keyof typeof ErrorMessages.INVITES}`
    | `TENANT.${keyof typeof ErrorMessages.TENANT}`
    | `RBAC.${keyof typeof ErrorMessages.RBAC}`
    | `CLOUD_ACCOUNTS.${keyof typeof ErrorMessages.CLOUD_ACCOUNTS}`
    | `DATABASE.${keyof typeof ErrorMessages.DATABASE}`
    | `VALIDATION.${keyof typeof ErrorMessages.VALIDATION}`
    | `GENERAL.${keyof typeof ErrorMessages.GENERAL}`;

/**
 * Tipo para resposta de erro da API
 */
export interface ApiErrorResponse {
    statusCode: number;
    error: string;
    message: string | string[];
    path: string;
    timestamp: string;
}

type LocalizedMessage = {
    en: string;
    pt: string;
};

/**
 * Utilitário para obter mensagem traduzida
 * @param category - Categoria do erro (ex: 'AUTH', 'USERS')
 * @param key - Chave do erro (ex: 'EMAIL_ALREADY_REGISTERED')
 * @param language - Idioma ('en' ou 'pt')
 * @returns Mensagem traduzida ou fallback
 */
export function getErrorMessage(category: keyof typeof ErrorMessages, key: string, language: 'en' | 'pt' = 'pt'): string {
    const categoryMessages = ErrorMessages[category] as Record<string, LocalizedMessage>;
    const message = categoryMessages[key];
    if (!message) {
        return ErrorMessages.GENERAL.UNEXPECTED_ERROR[language];
    }

    return message[language] ?? message.en;
}

/**
 * Utilitário para mapear erro da API para mensagem traduzida
 * @param error - Erro recebido da API
 * @param language - Idioma ('en' ou 'pt')
 * @returns Mensagem traduzida
 */
export function getApiErrorMessage(error: ApiErrorResponse | unknown, language: 'en' | 'pt' = 'pt'): string {
    if (!error) {
        return ErrorMessages.GENERAL.UNEXPECTED_ERROR[language];
    }

    const apiError = error as ApiErrorResponse;

    // Se a mensagem vier como string simples, tenta encontrar a tradução
    if (typeof apiError.message === 'string') {
        // Procura nos erro messages do backend e retorna tradução
        for (const messages of Object.values(ErrorMessages) as Array<Record<string, LocalizedMessage>>) {
            for (const msg of Object.values(messages)) {
                if (msg.en === apiError.message || msg.pt === apiError.message) {
                    return msg[language] ?? msg.en;
                }
            }
        }
    }

    // Fallback para mensagens genéricas baseadas no status code
    const statusCode = apiError.statusCode || 500;
    const statusMap: Record<number, keyof typeof ErrorMessages.GENERAL> = {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        500: 'INTERNAL_SERVER_ERROR',
    };

    const errorKey = statusMap[statusCode] || 'INTERNAL_SERVER_ERROR';
    return ErrorMessages.GENERAL[errorKey][language];
}

/**
 * Utilitário para extrair mensagem de erro em qualquer formato
 * @param error - Erro em qualquer formato
 * @param language - Idioma ('en' ou 'pt')
 * @returns Mensagem de erro traduzida
 */
export function extractErrorMessage(error: unknown, language: 'en' | 'pt' = 'pt'): string {
    if (!error) {
        return ErrorMessages.GENERAL.UNEXPECTED_ERROR[language];
    }

    // Erro da API
    if (typeof error === 'object' && 'statusCode' in error) {
        return getApiErrorMessage(error as ApiErrorResponse, language);
    }

    // Erro simples string
    if (typeof error === 'string') {
        return error;
    }

    // Erro com message property
    if (typeof error === 'object' && 'message' in error) {
        const msg = (error as { message: unknown }).message;
        return typeof msg === 'string' ? msg : ErrorMessages.GENERAL.UNEXPECTED_ERROR[language];
    }

    return ErrorMessages.GENERAL.UNEXPECTED_ERROR[language];
}
