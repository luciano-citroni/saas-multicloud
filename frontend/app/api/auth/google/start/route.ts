import { NextResponse } from 'next/server';
import { getBackendPublicUrl } from '@/lib/auth/session';

export async function GET(request: Request) {
    const redirectUri = new URL('/auth/google/callback', request.url);
    const backendGoogleUrl = new URL('/api/auth/google', getBackendPublicUrl());
    backendGoogleUrl.searchParams.set('redirect_uri', redirectUri.toString());

    return NextResponse.redirect(backendGoogleUrl.toString());
}
