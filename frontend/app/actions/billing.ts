export async function fetchPlans(organizationId: string) {
    const url = `/api/billing/plans?organizationId=${encodeURIComponent(organizationId)}`;
    const res = await fetch(url, { cache: 'no-store' });
    return res;
}

export async function fetchSubscription(organizationId: string, checkoutSessionId?: string) {
    const url = new URL('/api/billing/subscription', location.origin);
    url.searchParams.set('organizationId', organizationId);
    if (checkoutSessionId) url.searchParams.set('checkoutSessionId', checkoutSessionId);
    const res = await fetch(url.toString(), { cache: 'no-store' });
    return res;
}

export async function createChangePlanSession(organizationId: string, priceId: string) {
    const url = `/api/billing/subscription?organizationId=${encodeURIComponent(organizationId)}`;
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
    });
    return res;
}
