export type CommitmentLabelT = {
    commitmentsTypeSp: string;
    commitmentsTypeReservation: string;
    commitmentsTypeCud: string;
    termOneYear: string;
    termThreeYears: string;
    paymentNoUpfront: string;
    paymentPartialUpfront: string;
    paymentAllUpfront: string;
    commitmentLookbackDays: string;
    commitmentRecommendAction: string;
    commitmentAppliesTo: string;
    commitmentAppliesToLine: string;
    commitmentAppliesToHintSp: string;
    commitmentAppliesToHintRi: string;
    commitmentAppliesToHintAzure: string;
    commitmentAppliesToHintCud: string;
    spServiceEc2: string;
    spServiceLambda: string;
    spServiceFargate: string;
    riServiceEc2: string;
    azureReservationVm: string;
    cudServiceCompute: string;
};

function normalizeToken(value: string): string {
    return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function commitmentTypeLabel(type: string | null | undefined, t: CommitmentLabelT): string {
    if (type === 'savings_plan') return t.commitmentsTypeSp;
    if (type === 'reservation') return t.commitmentsTypeReservation;
    if (type === 'cud') return t.commitmentsTypeCud;
    return type?.trim() || t.commitmentsTypeReservation;
}

export function commitmentTermLabel(term: string | null | undefined, t: CommitmentLabelT): string | null {
    if (!term) return null;
    const normalized = normalizeToken(term);
    if (normalized === 'ONE_YEAR' || normalized === '1_YEAR' || normalized === 'P1Y') return t.termOneYear;
    if (normalized === 'THREE_YEARS' || normalized === '3_YEARS' || normalized === 'P3Y') return t.termThreeYears;
    return term.replace(/_/g, ' ');
}

export function commitmentPaymentLabel(
    option: string | null | undefined,
    t: CommitmentLabelT,
): string | null {
    if (!option) return null;
    const normalized = normalizeToken(option);
    if (normalized === 'NO_UPFRONT') return t.paymentNoUpfront;
    if (normalized === 'PARTIAL_UPFRONT') return t.paymentPartialUpfront;
    if (normalized === 'ALL_UPFRONT') return t.paymentAllUpfront;
    return option.replace(/_/g, ' ');
}

export function commitmentLookbackLabel(
    lookbackDays: number | null | undefined,
    t: CommitmentLabelT,
): string | null {
    if (lookbackDays == null || !Number.isFinite(lookbackDays) || lookbackDays <= 0) return null;
    return t.commitmentLookbackDays.replace('{days}', String(lookbackDays));
}

/** Human title for a commitment purchase recommendation (localized). */
export function commitmentRecommendationTitle(
    input: {
        commitmentType?: string | null;
        type?: string | null;
        term?: string | null;
        paymentOption?: string | null;
    },
    t: CommitmentLabelT,
): string {
    return commitmentTypeLabel(input.commitmentType ?? input.type, t);
}

/** Secondary line: term · payment · lookback (localized, no raw API keys). */
export function commitmentRecommendationSubtitle(
    input: {
        term?: string | null;
        paymentOption?: string | null;
        lookbackDays?: number | null;
    },
    t: CommitmentLabelT,
): string {
    return [
        commitmentTermLabel(input.term, t),
        commitmentPaymentLabel(input.paymentOption, t),
        commitmentLookbackLabel(input.lookbackDays, t),
    ]
        .filter(Boolean)
        .join(' · ');
}

/** Recommended action copy for savings list. */
export function commitmentRecommendationAction(
    input: {
        commitmentType?: string | null;
        type?: string | null;
        term?: string | null;
        paymentOption?: string | null;
    },
    t: CommitmentLabelT,
): string {
    return t.commitmentRecommendAction
        .replace('{type}', commitmentTypeLabel(input.commitmentType ?? input.type, t))
        .replace('{term}', commitmentTermLabel(input.term, t) ?? '—')
        .replace('{payment}', commitmentPaymentLabel(input.paymentOption, t) ?? '—');
}

function normalizeProvider(provider: string | null | undefined): string {
    return (provider ?? '').trim().toLowerCase();
}

/**
 * Services whose usage can consume this commitment recommendation
 * (Compute SP / RI / Azure Reservation / GCP CUD). Localized labels.
 */
export function commitmentApplicableServices(
    input: {
        commitmentType?: string | null;
        type?: string | null;
        cloudProvider?: string | null;
        provider?: string | null;
    },
    t: CommitmentLabelT,
): string[] {
    const commitmentType = (input.commitmentType ?? input.type ?? '').trim().toLowerCase();
    const provider = normalizeProvider(input.cloudProvider ?? input.provider);

    if (commitmentType === 'savings_plan') {
        // AWS Compute Savings Plans (what we collect today).
        return [t.spServiceEc2, t.spServiceLambda, t.spServiceFargate];
    }

    if (commitmentType === 'reservation') {
        if (provider === 'azure') return [t.azureReservationVm];
        return [t.riServiceEc2];
    }

    if (commitmentType === 'cud') {
        return [t.cudServiceCompute];
    }

    return [];
}

export function commitmentAppliesToLine(
    input: {
        commitmentType?: string | null;
        type?: string | null;
        cloudProvider?: string | null;
        provider?: string | null;
    },
    t: CommitmentLabelT,
): string | null {
    const services = commitmentApplicableServices(input, t);
    if (services.length === 0) return null;
    return t.commitmentAppliesToLine.replace('{services}', services.join(', '));
}

export function commitmentAppliesToHint(
    input: {
        commitmentType?: string | null;
        type?: string | null;
        cloudProvider?: string | null;
        provider?: string | null;
    },
    t: CommitmentLabelT,
): string | null {
    const commitmentType = (input.commitmentType ?? input.type ?? '').trim().toLowerCase();
    const provider = normalizeProvider(input.cloudProvider ?? input.provider);

    if (commitmentType === 'savings_plan') return t.commitmentAppliesToHintSp;
    if (commitmentType === 'cud') return t.commitmentAppliesToHintCud;
    if (commitmentType === 'reservation') {
        return provider === 'azure' ? t.commitmentAppliesToHintAzure : t.commitmentAppliesToHintRi;
    }
    return null;
}
