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

function parseEnvOriginList(rawValue: string | undefined): string[] {
    if (!rawValue) {
        return [];
    }

    return rawValue
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map((value) => parseOrigin(value))
        .filter((value): value is string => Boolean(value));
}

function getConfiguredOrigins(): string[] {
    const configuredValues = [
        ...parseEnvOriginList(process.env.NEXT_PUBLIC_ALLOWED_ORIGINS),
        ...parseEnvOriginList(process.env.ALLOWED_AUTH_ORIGINS),
        ...parseEnvOriginList(process.env.NEXT_PUBLIC_FRONTEND_URL),
        ...parseEnvOriginList(process.env.NEXT_PUBLIC_APP_URL),
        ...parseEnvOriginList(process.env.FRONTEND_URL),
    ];

    return Array.from(new Set(configuredValues));
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
    for (const origin of getConfiguredOrigins()) {
        allowedOrigins.add(origin);
    }

    return allowedOrigins;
}

export function getPublicAppOrigin(request: Request): string {
    const configuredOrigins = getConfiguredOrigins();
    if (configuredOrigins.length > 0) {
        return configuredOrigins[0];
    }

    const forwardedOrigin = getForwardedOrigin(request);
    if (forwardedOrigin) {
        return forwardedOrigin;
    }

    return parseOrigin(request.url) ?? 'http://localhost:3000';
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
