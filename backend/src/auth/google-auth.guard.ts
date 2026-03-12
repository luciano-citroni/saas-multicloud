import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

type RequestWithRedirectQuery = {
    query: {
        redirect_uri?: string | string[];
    };
};

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
    constructor(private readonly configService: ConfigService) {
        super();
    }

    getAuthenticateOptions(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<RequestWithRedirectQuery>();
        const requestedRedirectUri = Array.isArray(request.query.redirect_uri) ? request.query.redirect_uri[0] : request.query.redirect_uri;
        const safeRedirectUri = this.getSafeRedirectUri(requestedRedirectUri);

        if (!safeRedirectUri) {
            return undefined;
        }

        return {
            state: Buffer.from(JSON.stringify({ redirectUri: safeRedirectUri })).toString('base64url'),
        };
    }

    private getSafeRedirectUri(redirectUri?: string): string | null {
        if (!redirectUri) {
            return null;
        }

        try {
            const requestedUrl = new URL(redirectUri);
            if (!['http:', 'https:'].includes(requestedUrl.protocol)) {
                return null;
            }

            const configuredFrontendUrl = new URL(this.configService.getOrThrow<string>('FRONTEND_URL'));
            const isConfiguredFrontend = requestedUrl.origin === configuredFrontendUrl.origin;
            const isLocalhostInDevelopment =
                this.configService.get<string>('NODE_ENV') !== 'production' && ['localhost', '127.0.0.1'].includes(requestedUrl.hostname);

            if (!isConfiguredFrontend && !isLocalhostInDevelopment) {
                return null;
            }

            return requestedUrl.toString();
        } catch {
            return null;
        }
    }
}
