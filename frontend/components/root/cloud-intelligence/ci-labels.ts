'use client';

import {
    translateCiRecommendationTitle,
    translateGovernanceDescription,
    translateGovernanceResourceType,
} from '@/lib/governance-translations';
import { useTranslations } from '@/lib/i18n';
import type { Translations } from '@/lib/i18n/translations';

const STATUS_KEYS = [
    'NEW',
    'REVIEWING',
    'APPROVED',
    'REJECTED',
    'EXECUTING',
    'COMPLETED',
    'FAILED',
    'DISMISSED',
] as const;

const CATEGORY_KEYS = ['security', 'finops'] as const;

const PLANNED_ACTION_KEYS = [
    'read_context',
    'validate_account',
    'refresh_inventory',
    'no_auto_mutation',
    'open_editor',
    'remediate_s3_encryption',
    'remediate_s3_public_access',
    'remediate_s3_versioning',
    'remediate_ec2_snapshot_ebs',
    'remediate_ec2_terminate_delete_ebs',
    'remediate_required_tags',
    'manual_remediation',
    'investigate_cost_anomaly',
    'requires_human_review',
    'ready_to_execute',
] as const;

export type CiStatus = (typeof STATUS_KEYS)[number];
export type CiCategory = (typeof CATEGORY_KEYS)[number];
export type CiPlannedActionKey = (typeof PLANNED_ACTION_KEYS)[number];

/** Mirrors backend ALLOWED_TRANSITIONS for recommendation status updates. */
export const RECOMMENDATION_STATUS_TRANSITIONS: Record<CiStatus, CiStatus[]> = {
    NEW: ['REVIEWING', 'APPROVED', 'REJECTED', 'DISMISSED'],
    REVIEWING: ['APPROVED', 'REJECTED', 'DISMISSED', 'NEW'],
    APPROVED: ['EXECUTING', 'REJECTED', 'DISMISSED'],
    REJECTED: ['NEW', 'DISMISSED'],
    EXECUTING: ['COMPLETED', 'FAILED', 'DISMISSED'],
    COMPLETED: ['DISMISSED'],
    FAILED: ['NEW', 'DISMISSED'],
    DISMISSED: ['NEW'],
};

export function getAllowedRecommendationStatusTransitions(status: string): CiStatus[] {
    if ((STATUS_KEYS as readonly string[]).includes(status)) {
        return RECOMMENDATION_STATUS_TRANSITIONS[status as CiStatus] ?? [];
    }
    return [];
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

export function isCostAnomalyRecommendation(item: {
    title: string;
    evidence?: Record<string, unknown> | null;
    resourceReference?: Record<string, unknown> | null;
}): boolean {
    const title = item.title.toLowerCase();
    const evidence = asRecord(item.evidence);
    const ref = asRecord(item.resourceReference);
    return (
        title.startsWith('cost anomaly:') ||
        title.startsWith('anomalia de custo:') ||
        typeof evidence.anomalyId === 'string' ||
        String(ref.resourceType ?? '').toLowerCase() === 'costanomaly'
    );
}

export function isStoppedEc2EbsRecommendation(item: {
    title: string;
    description: string;
    evidence?: Record<string, unknown> | null;
    resourceReference?: Record<string, unknown> | null;
}): boolean {
    const evidence = asRecord(item.evidence);
    const ref = asRecord(item.resourceReference);
    const type = String(evidence.type ?? '').toLowerCase();
    const title = item.title.toLowerCase();
    const description = item.description.toLowerCase();
    const resourceId = String(ref.resourceId ?? '');
    const resourceType = String(ref.resourceType ?? '').toLowerCase();

    if (type === 'stopped-ec2-ebs-cost') return true;
    if (title.includes('stopped-ec2-ebs-cost')) return true;
    if (resourceId.startsWith('i-') && description.includes('snapshot') && description.includes('ebs')) {
        return true;
    }
    if (
        resourceType.includes('ec2') &&
        (description.includes('está parada') || description.includes('stopped')) &&
        description.includes('ebs')
    ) {
        return true;
    }
    return false;
}

function isRequiredTagsRecommendation(item: {
    title: string;
    description: string;
    evidence?: Record<string, unknown> | null;
    resourceReference?: Record<string, unknown> | null;
}): boolean {
    const evidence = asRecord(item.evidence);
    const policyId = String(evidence.policyId ?? '').toLowerCase();
    const knowledgeRuleType = String(evidence.knowledgeRuleType ?? '').toLowerCase();
    const policy = item.title
        .replace(/^Governance:\s*/i, '')
        .replace(/^Governança:\s*/i, '')
        .trim()
        .toLowerCase();
    const description = item.description.toLowerCase();
    if (knowledgeRuleType === 'required_tags') return true;
    if (
        policyId.includes('required-tags') ||
        policyId.includes('required-labels') ||
        policyId === 'aws-ec2-required-tags' ||
        policyId === 'gcp-vm-required-labels'
    ) {
        return true;
    }
    if (Array.isArray(evidence.missingTags) && evidence.missingTags.length > 0) return true;
    if (
        policy.includes('required tags') ||
        policy.includes('required labels') ||
        description.includes('missing required tags') ||
        description.includes('missing required labels') ||
        description.includes('missing tags')
    ) {
        return true;
    }
    return false;
}

function isNamingRecommendation(item: {
    title: string;
    description: string;
    evidence?: Record<string, unknown> | null;
}): boolean {
    const evidence = asRecord(item.evidence);
    const policyId = String(evidence.policyId ?? '').toLowerCase();
    const knowledgeRuleType = String(evidence.knowledgeRuleType ?? '').toLowerCase();
    const policy = item.title
        .replace(/^Governance:\s*/i, '')
        .replace(/^Governança:\s*/i, '')
        .trim()
        .toLowerCase();
    const description = item.description.toLowerCase();
    if (knowledgeRuleType === 'naming_pattern') return true;
    if (policyId.includes('-naming') || policyId.endsWith('naming')) return true;
    if (policy.includes('naming pattern') || policy.includes('nomenclatura')) return true;
    if (
        description.includes('does not match required naming') ||
        description.includes('naming pattern')
    ) {
        return true;
    }
    return false;
}

function canAutomateRequiredTagsRecommendation(item: {
    title: string;
    description: string;
    evidence?: Record<string, unknown> | null;
    resourceReference?: Record<string, unknown> | null;
}): boolean {
    if (!isRequiredTagsRecommendation(item)) return false;
    const evidence = asRecord(item.evidence);
    const ref = asRecord(item.resourceReference);
    const resourceId = String(ref.resourceId ?? '');
    const resourceType = String(ref.resourceType ?? '').toLowerCase();
    const policyId = String(evidence.policyId ?? '').toLowerCase();
    if (policyId === 'aws-ec2-required-tags') return true;
    if (resourceId.startsWith('i-')) return true;
    if (resourceType.includes('ec2') && !resourceType.includes('rds')) return true;
    return false;
}

export function canAutomateRecommendation(item: {
    title: string;
    description: string;
    evidence?: Record<string, unknown> | null;
    resourceReference?: Record<string, unknown> | null;
}): boolean {
    if (isCostAnomalyRecommendation(item)) return false;
    if (isNamingRecommendation(item)) return false;
    if (isStoppedEc2EbsRecommendation(item)) return true;
    if (canAutomateRequiredTagsRecommendation(item)) return true;

    const evidence = asRecord(item.evidence);
    const ref = asRecord(item.resourceReference);
    const type = String(evidence.type ?? '').toLowerCase();
    const resourceId = String(ref.resourceId ?? '');
    const resourceTypeEarly = String(ref.resourceType ?? '').toLowerCase();
    const titleLower = item.title.toLowerCase();
    const descriptionLower = item.description.toLowerCase();
    if (
        type === 'unused_ebs' ||
        type === 'unused_disk' ||
        (resourceId.startsWith('vol-') &&
            (titleLower.includes('unused') || descriptionLower.includes('unused'))) ||
        ((resourceTypeEarly.includes('ebs') || resourceTypeEarly.includes('volume')) &&
            (titleLower.includes('sem uso') ||
                titleLower.includes('unused') ||
                descriptionLower.includes('unused')))
    ) {
        return true;
    }

    const policy = item.title.replace(/^Governance:\s*/i, '').replace(/^Governança:\s*/i, '').trim().toLowerCase();
    const description = item.description.toLowerCase();
    const resourceType = resourceTypeEarly;
    const isS3 =
        resourceType.includes('s3') ||
        policy.includes('s3 bucket') ||
        policy.includes('bucket s3') ||
        description.includes('s3 bucket') ||
        description.includes('bucket s3');

    if (!isS3) return false;

    return (
        policy.includes('server-side encryption') ||
        policy.includes('criptografia') ||
        description.includes('server-side encryption') ||
        description.includes('criptografia no servidor') ||
        policy.includes('publicly accessible') ||
        policy.includes('acessível publicamente') ||
        policy.includes('public access') ||
        description.includes('block public access') ||
        description.includes('publicly accessible') ||
        description.includes('acesso público') ||
        policy.includes('versioning') ||
        policy.includes('versionamento') ||
        description.includes('versioning')
    );
}

export function useCiLabels() {
    const t = useTranslations('cloudIntelligence');

    const statusLabel = (status: string) => {
        switch (status) {
            case 'NEW':
                return t.statusNew;
            case 'REVIEWING':
                return t.statusReviewing;
            case 'APPROVED':
                return t.statusApproved;
            case 'REJECTED':
                return t.statusRejected;
            case 'EXECUTING':
                return t.statusExecuting;
            case 'COMPLETED':
                return t.statusCompleted;
            case 'FAILED':
                return t.statusFailed;
            case 'DISMISSED':
                return t.statusDismissed;
            default:
                return status;
        }
    };

    const statusActionLabel = (status: string) => {
        switch (status) {
            case 'NEW':
                return t.statusNew;
            case 'APPROVED':
                return t.actionApprove;
            case 'REJECTED':
                return t.actionReject;
            case 'DISMISSED':
                return t.actionDismiss;
            case 'REVIEWING':
                return t.actionReviewing;
            case 'EXECUTING':
                return t.statusExecuting;
            case 'COMPLETED':
                return t.statusCompleted;
            case 'FAILED':
                return t.statusFailed;
            default:
                return statusLabel(status);
        }
    };

    const categoryLabel = (category: string) => {
        if (category === 'security') return t.categorySecurity;
        if (category === 'finops') return t.categoryFinops;
        return category;
    };

    const severityLabel = (severity: string) => {
        switch (severity) {
            case 'critical':
                return t.severityCritical;
            case 'high':
                return t.severityHigh;
            case 'medium':
                return t.severityMedium;
            case 'low':
                return t.severityLow;
            default:
                return severity;
        }
    };

    const recommendationTitle = (title: string) =>
        translateCiRecommendationTitle(title, {
            governance: t.titleGovernancePrefix,
            costAnomaly: t.titleCostAnomalyPrefix,
        });

    const recommendationDescription = (description: string) =>
        translateGovernanceDescription(description);

    const resourceTypeLabel = (resourceType: string) =>
        translateGovernanceResourceType(resourceType);

    const plannedActionLabel = (action: string) => {
        switch (action) {
            case 'read_context':
                return t.plannedActionReadContext;
            case 'validate_account':
                return t.plannedActionValidateAccount;
            case 'refresh_inventory':
                return t.plannedActionRefreshInventory;
            case 'no_auto_mutation':
                return t.plannedActionNoAutoMutation;
            case 'open_editor':
                return t.plannedActionOpenEditor;
            case 'remediate_s3_encryption':
                return t.plannedActionRemediateS3Encryption;
            case 'remediate_s3_public_access':
                return t.plannedActionRemediateS3PublicAccess;
            case 'remediate_s3_versioning':
                return t.plannedActionRemediateS3Versioning;
            case 'remediate_ec2_snapshot_ebs':
                return t.plannedActionRemediateEc2SnapshotEbs;
            case 'remediate_ec2_terminate_delete_ebs':
                return t.plannedActionRemediateEc2TerminateDeleteEbs;
            case 'remediate_unused_ebs_snapshot':
                return t.plannedActionRemediateUnusedEbsSnapshot;
            case 'remediate_required_tags':
                return t.plannedActionRemediateRequiredTags;
            case 'manual_remediation':
                return t.plannedActionManualRemediation;
            case 'investigate_cost_anomaly':
                return t.plannedActionInvestigateCostAnomaly;
            case 'requires_human_review':
                return t.plannedActionRequiresHumanReview;
            case 'ready_to_execute':
                return t.plannedActionReadyToExecute;
            default:
                // Legacy free-text actions from older drafts.
                return action;
        }
    };

    const finopsTypeLabel = (type: string) => {
        switch (type) {
            case 'stopped-ec2-ebs-cost':
                return t.finopsTypeStoppedEc2Ebs;
            case 'unused_ebs':
                return t.finopsTypeUnusedEbs;
            case 'underutilized_ec2':
                return t.finopsTypeUnderutilizedEc2;
            case 'oversized_rds':
                return t.finopsTypeOversizedRds;
            case 'unused_disk':
                return t.finopsTypeUnusedDisk;
            default:
                return type.replace(/[_-]+/g, ' ');
        }
    };

    return {
        statusLabel,
        statusActionLabel,
        categoryLabel,
        severityLabel,
        recommendationTitle,
        recommendationDescription,
        resourceTypeLabel,
        plannedActionLabel,
        finopsTypeLabel,
        STATUS_KEYS,
        CATEGORY_KEYS,
    };
}

type CloudIntelligenceCopy = Translations['cloudIntelligence'];

export function buildDailySummaryFromFindings(
    t: CloudIntelligenceCopy,
    reportDate: string,
    findings: Record<string, unknown> | null | undefined,
    metadata: Record<string, unknown> | null | undefined,
): string | null {
    if (!findings || typeof findings !== 'object') return null;

    const synced = Number(findings.syncedAccounts ?? 0);
    const anomalies = Number(findings.openAnomalies ?? 0);
    const govFindings = Number(findings.newFindings ?? 0);
    const savings = Number(findings.openFinopsSavings ?? 0);
    const created = Number(findings.recommendationsCreated ?? 0);

    if (metadata?.reason === 'no_actionable_sources' || metadata?.skipped === true) {
        return [
            t.dailySummaryTitle.replace('{date}', reportDate),
            t.dailySummarySynced.replace('{count}', String(synced)),
            t.dailySummaryAnomalies.replace('{count}', String(anomalies)),
            t.dailySummaryFindings.replace('{count}', String(govFindings)),
            t.dailySummarySavings.replace('{count}', String(savings)),
            t.dailySummaryCreated.replace('{count}', String(created)),
            '',
            t.dailySummaryNoSourcesBody,
        ].join('\n');
    }

    if (
        findings.openAnomalies != null ||
        findings.newFindings != null ||
        findings.openFinopsSavings != null
    ) {
        return [
            t.dailySummaryTitle.replace('{date}', reportDate),
            t.dailySummarySynced.replace('{count}', String(synced)),
            t.dailySummaryAnomalies.replace('{count}', String(anomalies)),
            t.dailySummaryFindings.replace('{count}', String(govFindings)),
            t.dailySummarySavings.replace('{count}', String(savings)),
            t.dailySummaryCreated.replace('{count}', String(created)),
            '',
            t.dailySummaryReadyBody,
        ].join('\n');
    }

    return null;
}
