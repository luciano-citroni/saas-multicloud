import { NextResponse } from 'next/server';

/** E-mails agora são criados via /api/notifications/groups/:id/emails */
export async function GET() {
    return NextResponse.json(
        { message: 'Use GET /api/notifications/groups?channel=email' },
        { status: 410 }
    );
}
