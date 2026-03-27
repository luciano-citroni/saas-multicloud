import { NextResponse } from 'next/server';
import { getBackendPublicUrl } from '@/lib/auth/session';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const backendCallbackUrl = new URL('/api/auth/google/callback', getBackendPublicUrl());

    backendCallbackUrl.search = requestUrl.search;

    return NextResponse.redirect(backendCallbackUrl.toString());
}
