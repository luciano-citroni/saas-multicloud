export async function fetchPlans() {
    return fetch('/api/billing/plans', { cache: 'no-store' });
}

export async function fetchSubscription(organizationId: string, checkoutSessionId?: string) {
    const url = new URL('/api/billing/subscription', location.origin);
    url.searchParams.set('organizationId', organizationId);
    if (checkoutSessionId) url.searchParams.set('checkoutSessionId', checkoutSessionId);
    return fetch(url.toString(), { cache: 'no-store' });
}

export async function createChangePlanSession(organizationId: string, priceId: string) {
    return fetch('/api/billing/subscription', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, priceId }),
    });
}
