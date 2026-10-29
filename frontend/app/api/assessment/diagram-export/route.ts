import { NextResponse } from 'next/server';
import { getAccessTokenFromCookies, getRefreshTokenFromCookies, refreshAccessToken } from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

type DiagramExportRequest = {
    svgDataUrl?: unknown;
    provider?: unknown;
    exportedAt?: unknown;
};

const MAX_SVG_DATA_URL_LENGTH = 6_000_000;

function normalizeProvider(value: unknown): string {
    if (typeof value !== 'string') {
        return 'multicloud';
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === 'aws' || normalized === 'azure' || normalized === 'gcp') {
        return normalized;
    }

    return 'multicloud';
}

function safeFileTimestamp(value: unknown): string {
    if (typeof value !== 'string') {
        return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    }

    return date.toISOString().slice(0, 19).replace(/:/g, '-');
}

function extractSvgMarkup(dataUrl: string): string | null {
    const prefix = 'data:image/svg+xml;charset=utf-8,';

    if (!dataUrl.startsWith(prefix)) {
        return null;
    }

    const encodedSvg = dataUrl.slice(prefix.length);

    try {
        const decoded = decodeURIComponent(encodedSvg);
        if (!decoded.includes('<svg')) {
            return null;
        }
        return decoded;
    } catch {
        return null;
    }
}

async function hasValidSession(): Promise<boolean> {
    const accessToken = await getAccessTokenFromCookies();
    if (accessToken) return true;

    const refreshToken = await getRefreshTokenFromCookies();
    if (!refreshToken) return false;

    const rotated = await refreshAccessToken(refreshToken);
    return Boolean(rotated?.accessToken);
}

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    if (!(await hasValidSession())) {
        return NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
    }

    let body: DiagramExportRequest;

    try {
        body = (await request.json()) as DiagramExportRequest;
    } catch {
        return NextResponse.json({ message: 'Payload inválido' }, { status: 400 });
    }

    const svgDataUrl = typeof body.svgDataUrl === 'string' ? body.svgDataUrl : '';

    if (!svgDataUrl || svgDataUrl.length > MAX_SVG_DATA_URL_LENGTH) {
        return NextResponse.json({ message: 'SVG inválido ou muito grande' }, { status: 400 });
    }

    const svgMarkup = extractSvgMarkup(svgDataUrl);

    if (!svgMarkup) {
        return NextResponse.json({ message: 'Falha ao processar SVG' }, { status: 400 });
    }

    const provider = normalizeProvider(body.provider);
    const timestamp = safeFileTimestamp(body.exportedAt);
    const filename = `assessment-diagrama-${provider}-${timestamp}.svg`;

    return new NextResponse(svgMarkup, {
        status: 200,
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
        },
    });
}
