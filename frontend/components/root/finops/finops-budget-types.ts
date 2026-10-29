export type FinopsBudgetStatusItem = {
    budget: {
        id: string;
        name: string;
        amount: number;
        currency: string;
        period: string;
        scope?: 'organization' | 'cloud_account';
        cloudAccountId?: string | null;
        service: string | null;
        resourceId?: string | null;
        alertThresholds: number[];
        alertFrequency?: string;
        alertType?: string;
        alertAmount?: number | null;
        alertChannels?: Array<'email' | 'whatsapp'>;
        alertEmails?: string[];
        alertNotificationGroupIds?: string[];
        isActive: boolean;
    };
    currentSpend: number;
    remainingAmount: number;
    usagePercentage: number;
    triggeredAlerts: number[];
    currency: string;
    cloudAccountAlias?: string;
};
