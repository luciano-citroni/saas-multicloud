import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/auth/session';

export async function GET() {
    return NextResponse.redirect(`${getBackendUrl()}/api/auth/google`);
}
