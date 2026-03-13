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
        CANNOT_DELETE_WHILE_IN_ORGANIZATION: 'You cannot delete your account while you are a member of an organization',
    },

    // Organizations
    ORGANIZATIONS: {
        NOT_FOUND: 'Organization not found',
        CNPJ_ALREADY_IN_USE: 'This CNPJ is already in use',
    },

    // Organization members
    MEMBERS: {
        NOT_FOUND: 'Member not found in this organization.',
        CANNOT_REMOVE_OWNER: 'The organization owner cannot be removed.',
        CANNOT_REMOVE_SELF: 'You cannot remove yourself from the organization this way.',
        CANNOT_CHANGE_OWNER_ROLE: 'The role of the organization owner cannot be changed.',
        CANNOT_PROMOTE_TO_OWNER: 'Only the owner can transfer ownership.',
        INSUFFICIENT_ROLE_TO_MODIFY: 'You can only manage members with a lower role than yours.',
    },

    // Organization invites
    INVITES: {
        NOT_FOUND: 'Invite not found or has already been used.',
        EXPIRED: 'This invite has expired.',
        ALREADY_ACCEPTED: 'This invite has already been accepted.',
        USER_ALREADY_MEMBER: 'This user is already a member of the organization.',
        USER_NOT_REGISTERED: 'No account found with this email. Please register before accepting the invite.',
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

    // Plans / subscriptions
    PLANS: {
        NO_ACTIVE_PLAN: 'Your organization does not have an active plan.',
        PLAN_METADATA_NOT_AVAILABLE: 'Could not resolve plan limits for this organization.',
        CLOUD_ACCOUNT_LIMIT_REACHED: 'Cloud account limit reached for your current plan.',
        USER_LIMIT_REACHED: 'User limit reached for your current plan.',
        MODULE_NOT_ENABLED: 'This feature is not enabled in your current plan.',
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
