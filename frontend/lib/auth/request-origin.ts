export function hasTrustedOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');

    if (origin) {
        return origin === new URL(request.url).origin;
    }

    const referer = request.headers.get('referer');

    if (!referer) {
        return true;
    }

    try {
        return new URL(referer).origin === new URL(request.url).origin;
    } catch {
        return false;
    }
}
