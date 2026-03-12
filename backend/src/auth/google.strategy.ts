import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface GoogleProfile {
    googleId: string;
    email: string;
    name: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(configService: ConfigService) {
        super({
            clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
            clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
            callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
            scope: ['email', 'profile'],
        });
    }

    validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback): void {
        const email = profile.emails?.[0]?.value;
        if (!email) {
            done(new Error('No email returned from Google'), undefined);
            return;
        }

        const googleProfile: GoogleProfile = {
            googleId: profile.id,
            email,
            name: profile.displayName ?? `${profile.name?.givenName ?? ''} ${profile.name?.familyName ?? ''}`.trim(),
        };

        done(null, googleProfile);
    }
}
