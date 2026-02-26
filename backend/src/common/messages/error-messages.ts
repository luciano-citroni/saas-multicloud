/**
 * Mensagens de erro padronizadas em inglês
 * Centralize aqui todas as mensagens de erro da aplicação
 */

export const ErrorMessages = {
    // Auth
    AUTH: {
        EMAIL_ALREADY_REGISTERED: 'This email is already in use',
        CPF_ALREADY_REGISTERED: 'This CPF is already in use',
        INVALID_CREDENTIALS: 'Invalid email or password',
        ACCOUNT_INACTIVE: 'This account is inactive',
        INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',
        INVALID_OR_EXPIRED_TOKEN: 'Token is invalid or expired',
    },

    // Users
    USERS: {
        NOT_FOUND: 'User not found',
        EMAIL_ALREADY_IN_USE: 'This email is already in use',
        CPF_ALREADY_IN_USE: 'This CPF is already in use',
    },

    // Organizations
    ORGANIZATIONS: {
        NOT_FOUND: 'Organization not found',
        CNPJ_ALREADY_IN_USE: 'This CNPJ is already in use',
    },

    // Tenant context (multi-tenancy)
    TENANT: {
        MISSING_HEADER: 'Missing organization context. Send the "x-organization-id" header.',
        INVALID_ORG_ID: 'Invalid organization ID format.',
        NO_ACCESS: 'You do not have access to this organization or it does not exist.',
    },

    // RBAC (roles)
    RBAC: {
        INSUFFICIENT_PERMISSIONS: 'You do not have permission to perform this action.',
        MISSING_MEMBERSHIP: 'No organization membership found in request context.',
    },

    // Cloud accounts
    CLOUD_ACCOUNTS: {
        NOT_FOUND: 'Cloud account not found.',
        ALIAS_ALREADY_IN_USE: 'A cloud account with this alias already exists in the organization.',
        INVALID_PROVIDER: 'Invalid cloud provider. Supported: aws, azure, gcp.',
    },

    // Database
    DATABASE: {
        CONFLICT: 'This value is already in use',
        FOREIGN_KEY_VIOLATION: 'Invalid reference: the referenced record does not exist',
        CONSTRAINT_VIOLATION: 'Database constraint violation',
    },

    // Validation
    VALIDATION: {
        INVALID_EMAIL: 'Invalid email format',
        INVALID_CPF: 'Invalid CPF',
        INVALID_CNPJ: 'Invalid CNPJ',
        PASSWORD_REQUIREMENTS: 'Password must be at least 8 characters with uppercase, lowercase, number and special character',
    },

    // General
    GENERAL: {
        UNEXPECTED_ERROR: 'An unexpected error occurred',
        BAD_REQUEST: 'Invalid request',
        UNAUTHORIZED: 'Unauthorized access',
        FORBIDDEN: 'Access forbidden',
        NOT_FOUND: 'Resource not found',
        CONFLICT: 'Resource conflict',
        INTERNAL_SERVER_ERROR: 'Internal server error',
    },
};
