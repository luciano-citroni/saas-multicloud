function parseOrigin(value: string | null): string | null {
    if (!value) {
        return null;
    }

    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function addOrigin(origins: Set<string>, rawUrl: string | undefined) {
    if (!rawUrl) {
        return;
    }

    const normalized = parseOrigin(rawUrl);
    if (normalized) {
        origins.add(normalized);
    }
}

function getForwardedOrigin(request: Request): string | null {
    const forwardedHost = request.headers.get('x-forwarded-host');

    if (!forwardedHost) {
        return null;
    }

    const host = forwardedHost.split(',')[0]?.trim();
    if (!host) {
        return null;
    }

    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
    return parseOrigin(`${forwardedProto}://${host}`);
}

function getAllowedOrigins(request: Request): Set<string> {
    const allowedOrigins = new Set<string>();

    // Runtime URL da request.
    addOrigin(allowedOrigins, request.url);

    // Host público propagado por proxy/load balancer.
    const forwardedOrigin = getForwardedOrigin(request);
    if (forwardedOrigin) {
        allowedOrigins.add(forwardedOrigin);
    }

    // Origens públicas configuradas para o frontend.
    addOrigin(allowedOrigins, process.env.NEXT_PUBLIC_FRONTEND_URL);
    addOrigin(allowedOrigins, process.env.NEXT_PUBLIC_APP_URL);
    addOrigin(allowedOrigins, process.env.FRONTEND_URL);

    return allowedOrigins;
}

function isOriginAllowed(origin: string | null, allowedOrigins: Set<string>): boolean {
    if (!origin) {
        return false;
    }

    return allowedOrigins.has(origin);
}

export function hasTrustedOrigin(request: Request): boolean {
    const allowedOrigins = getAllowedOrigins(request);

    const requestOrigin = parseOrigin(request.headers.get('origin'));
    if (requestOrigin) {
        return isOriginAllowed(requestOrigin, allowedOrigins);
    }

    const refererOrigin = parseOrigin(request.headers.get('referer'));
    if (refererOrigin) {
        return isOriginAllowed(refererOrigin, allowedOrigins);
    }

    // Alguns fluxos de redirect não enviam Origin/Referer; nesse caso não bloquear.
    return true;
}
