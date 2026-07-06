import { NextResponse } from 'next/server';
import { getBackendPublicUrl } from '@/lib/auth/session';
import { getPublicAppOrigin } from '@/lib/auth/request-origin';

export async function GET(request: Request) {
    const redirectUri = new URL('/auth/google/callback', getPublicAppOrigin(request));
    const backendGoogleUrl = new URL('/api/auth/google', getBackendPublicUrl());
    backendGoogleUrl.searchParams.set('redirect_uri', redirectUri.toString());

    return NextResponse.redirect(backendGoogleUrl.toString());
}
