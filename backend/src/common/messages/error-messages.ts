/**


 * Mensagens de erro padronizadas em inglês


 * Centralize aqui todas as mensagens de erro da aplicação


 */

export const ErrorMessages = {
    // Auth

    AUTH: {
        EMAIL_ALREADY_REGISTERED: 'This email is already in use',

        INVALID_CREDENTIALS: 'Invalid email or password',

        ACCOUNT_INACTIVE: 'This account is inactive',

        INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',

        INVALID_OR_EXPIRED_TOKEN: 'Token is invalid or expired',

        EMAIL_CHANGE_NOT_ALLOWED:
            'Email cannot be changed directly. Contact support or use a verified email-change flow.',

        GOOGLE_EMAIL_NOT_VERIFIED: 'Google account email is not verified.',

        GOOGLE_LINK_REQUIRED:
            'An account with this email already exists. Sign in with your password first; Google linking is not automatic.',
    },

    // Users

    USERS: {
        NOT_FOUND: 'User not found',

        EMAIL_ALREADY_IN_USE: 'This email is already in use',

        CANNOT_DELETE_WHILE_IN_ORGANIZATION: 'You cannot delete your account while you are a member of an organization',
    },

    // Organizations

    ORGANIZATIONS: {
        NOT_FOUND: 'Organization not found',

        CNPJ_ALREADY_IN_USE: 'This CNPJ is already in use',

        OWNER_CANNOT_LEAVE: 'The organization owner cannot leave without transferring ownership or deleting the organization.',
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

        AWS_CONNECTION_FAILED: 'Could not assume the AWS IAM role. Check the Role ARN, trust policy, and External ID.',

        AWS_PLATFORM_CREDENTIALS_INVALID:
            'Platform AWS credentials are invalid or expired. Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY on the server.',

        AZURE_CONNECTION_FAILED: 'Could not authenticate with Azure. Check the Tenant ID, Client ID, Client Secret, and Subscription ID.',

        GCP_CONNECTION_FAILED: 'Could not authenticate with GCP. Check the Project ID, Service Account email, and impersonation setup.',

        CONNECTION_TIMEOUT: 'The cloud connection test timed out. Please try again.',

        CONNECTION_UNAVAILABLE: 'Cloud connection could not be verified right now. Please try again later.',
    },

    // Plans / subscriptions

    PLANS: {
        NO_ACTIVE_PLAN: 'Your account does not have an active plan.',

        PLAN_METADATA_NOT_AVAILABLE: 'Could not resolve plan limits for your account.',

        CLOUD_ACCOUNT_LIMIT_REACHED: 'Cloud account limit reached for your current plan.',

        ORG_ACCOUNT_LIMIT_REACHED: 'Organization limit reached for your current plan.',

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

        INVALID_CNPJ: 'Invalid CNPJ',

        PASSWORD_REQUIREMENTS: 'Password must be at least 8 characters with uppercase, lowercase, number and special character',
    },

    // FinOps

    FINOPS: {
        CONSENT_REQUIRED: 'FinOps consent is required before collecting cost data. Accept the terms at POST /finops/accounts/:id/consent.',

        CONSENT_NOT_FOUND: 'No active FinOps consent found for this cloud account and provider.',

        JOB_NOT_FOUND: 'FinOps sync job not found.',

        BUDGET_NOT_FOUND: 'FinOps budget not found.',

        RECOMMENDATION_NOT_FOUND: 'FinOps recommendation not found.',

        ANOMALY_NOT_FOUND: 'FinOps anomaly not found.',

        BILLING_NOT_FOUND: 'FinOps billing record not found.',
    },

    // Governance

    GOVERNANCE: {
        JOB_NOT_FOUND: 'Governance scan job not found.',

        SCAN_ALREADY_RUNNING: 'A governance scan is already running for this account.',

        SUPPRESSION_NOT_FOUND: 'Governance suppression not found.',
    },

    // Automation

    AUTOMATION: {
        NOT_FOUND: 'Automation execution not found.',

        WORKFLOW_NOT_FOUND: 'Automation workflow not found.',

        UNSUPPORTED_RESOURCE_TYPE: 'Unsupported resource type for provisioning.',

        FLOW_INVALID: 'The flow definition is invalid.',

        PROVISIONING_FAILED: 'Failed to provision one or more resources.',

        NOT_DRAFT: 'Automation can only be edited while in DRAFT status.',

        NOT_PUBLISHED: 'Automation must be published before execution.',

        NOT_ACTIVE: 'Automation is not active.',

        CYCLE_DETECTED: 'Workflow contains a dependency cycle.',

        INVALID_NODE_REFERENCE: 'Invalid node output reference.',

        INVALID_EDGE: 'Workflow edge references invalid nodes.',

        CLOUD_ACCOUNT_NOT_FOUND: 'Cloud account not found or not accessible.',

        TEMPLATE_NOT_FOUND: 'Automation template not found.',

        TEMPLATE_INVALID: 'Automation template is invalid.',

        TEMPLATE_TOO_LARGE: 'Automation template exceeds the CloudFormation body limit.',

        TEMPLATE_UNSUPPORTED: 'Automation template contains a construct that cannot be provisioned.',

        PROVIDER_NOT_SUPPORTED: 'Action provider does not match the automation cloud provider.',

        CONFIRMATION_REQUIRED: 'Provisioning requires explicit confirmation.',

        EXECUTION_IN_PROGRESS: 'An automation execution is already in progress.',

        CAPABILITY_NOT_CONFIRMED: 'CloudFormation IAM capabilities were not confirmed.',

        VARIABLE_UNRESOLVED: 'A required automation variable is unresolved.',

        INVALID_BINDING: 'Automation value binding is invalid.',

        STACK_FAILED: 'CloudFormation stack did not complete successfully.',

        RESOURCE_NOT_FOUND: 'The referenced AWS resource was not found.',

        ROLLBACK_NOT_ALLOWED: 'Only finished successful executions can be rolled back.',

        ROLLBACK_FAILED: 'Rollback could not remove one or more provisioned resources.',

        ROLLBACK_IN_PROGRESS: 'A rollback is already in progress for this execution.',
    },

    NOTIFICATIONS: {
        GROUP_NOT_FOUND: 'Notification group not found.',

        GROUP_ALREADY_EXISTS: 'A notification group with this name already exists.',

        EMAIL_NOT_FOUND: 'Notification email not found.',

        EMAIL_ALREADY_EXISTS: 'This email is already registered in the group.',

        WHATSAPP_NOT_IMPLEMENTED: 'WhatsApp notifications are not implemented yet.',

        GROUP_HAS_NO_ACTIVE_EMAILS: 'This notification group has no active emails to test.',

        TEST_SEND_FAILED: 'Could not send the test notification email.',
    },

    // AI Chat

    AI_CHAT: {
        CONVERSATION_NOT_FOUND: 'Chat conversation not found.',

        MESSAGE_TOO_LONG: 'Message exceeds the maximum allowed length.',

        PROVIDER_NOT_CONFIGURED: 'AI chat provider is not configured.',

        PROVIDER_UNAVAILABLE: 'AI chat provider is temporarily unavailable.',

        PROVIDER_TIMEOUT: 'AI chat provider timed out.',

        OUT_OF_SCOPE:
            'I can help with your organization data, cloud costs, inventory, assessments, governance, automations, and SaaS features. I cannot answer questions outside that scope.',

        TOOL_LIMIT_EXCEEDED: 'Too many tool calls were requested for this interaction.',

        GENERATION_CANCELLED: 'Generation was cancelled.',

        RATE_LIMITED: 'Too many AI chat requests. Please try again later.',

        NO_DATA: 'No data is available for this query in your organization.',
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
