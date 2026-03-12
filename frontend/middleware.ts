import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/constants';

const authPrefix = '/auth';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const hasSession = Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value);

    if (pathname.startsWith(authPrefix)) {
        if (hasSession) {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return NextResponse.next();
    }

    if (!hasSession) {
        const signInUrl = new URL('/auth/sign-in', request.url);
        signInUrl.searchParams.set('next', pathname);
        return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};
