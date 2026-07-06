import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

type AuthenticatedRequest = {
    user?: {
        sub?: string;
    };
    ip?: string;
    ips?: string[];
    headers?: {
        'x-forwarded-for'?: string | string[];
    };
    socket?: {
        remoteAddress?: string;
    };
};

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: AuthenticatedRequest): Promise<string> {
        const userId = req.user?.sub;
        if (userId) {
            return `user:${userId}`;
        }

        const forwarded = req.headers?.['x-forwarded-for'];
        const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();

        const ip = forwardedIp || req.ip || req.ips?.[0] || req.socket?.remoteAddress || 'unknown';
        return `ip:${ip}`;
    }

}