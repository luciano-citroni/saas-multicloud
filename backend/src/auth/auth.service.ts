import {
    ConflictException,
    Injectable,
    UnauthorizedException,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
    Logger,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtService } from '@nestjs/jwt';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, QueryFailedError, LessThan, In, IsNull } from 'typeorm';

import * as bcrypt from 'bcrypt';

import * as crypto from 'crypto';

import { UserSession } from '../db/entites/user-session.entity';

import { GoogleAuthCode } from '../db/entites/google-auth-code.entity';

import { EmailVerificationToken } from '../db/entites/email-verification-token.entity';

import { UsersService } from '../users/users.service';

import { LoginDto, RegisterDto, RegisterWithInviteDto } from './dto';

import { ErrorMessages } from '../common/messages/error-messages';

import { OrganizationService } from '../organization/organization.service';

import { BillingService } from '../billing/billing.service';

import { MailerService } from '../mailer/mailer.service';

export interface JwtPayload {
    sub: string;

    sessionId: string;
}

export interface AuthTokens {
    accessToken: string;

    refreshToken: string;
}

export interface ActiveSessionDto {
    id: string;
    createdAt: Date;
    expiresAt: Date;
    isCurrent: boolean;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_REUSE_GRACE_MS = 2 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 3;

const GOOGLE_AUTH_CODE_TTL_MS = 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @InjectRepository(UserSession)
        private readonly sessionRepository: Repository<UserSession>,

        @InjectRepository(GoogleAuthCode)
        private readonly googleAuthCodeRepository: Repository<GoogleAuthCode>,

        @InjectRepository(EmailVerificationToken)
        private readonly emailVerificationTokenRepository: Repository<EmailVerificationToken>,

        private readonly jwtService: JwtService,

        private readonly configService: ConfigService,

        private readonly usersService: UsersService,

        private readonly mailerService: MailerService,

        @Inject(forwardRef(() => OrganizationService))
        private readonly organizationService: OrganizationService,

        @Inject(forwardRef(() => BillingService))
        private readonly billingService: BillingService
    ) {}

    async register(dto: RegisterDto) {
        const normalizedEmail = dto.email.toLowerCase();

        const existingEmail = await this.usersService.findByEmail(normalizedEmail);

        if (existingEmail) throw new ConflictException(ErrorMessages.AUTH.EMAIL_ALREADY_REGISTERED);

        try {
            const user = await this.usersService.create({
                name: dto.name,
                email: normalizedEmail,
                password: dto.password,
            });

            this.billingService.initializeSubscription(user).catch((err: unknown) => {
                this.logger.error(`Failed to initialize subscription for user ${user.id}`, err);
            });

            this.issueEmailVerification(user.id).catch((err: unknown) => {
                this.logger.error(`Failed to send email verification for user ${user.id}`, err);
            });

            return {
                id: user.id,
                email: user.email,
                name: user.name,
                isActive: user.isActive,
                emailVerified: false,
            };
        } catch (error) {
            if (error instanceof QueryFailedError) {
                const dbError = error as QueryFailedError & { detail?: string };

                if (dbError.detail?.includes('email')) {
                    throw new ConflictException(ErrorMessages.AUTH.EMAIL_ALREADY_REGISTERED);
                }
            }

            throw error;
        }
    }

    async registerWithInvite(dto: RegisterWithInviteDto) {
        const normalizedEmail = dto.email.toLowerCase();

        // Validar o convite antes de proceder com o registro

        const invite = await this.organizationService.getInviteByToken(dto.inviteToken);

        // Verificar se o email fornecido corresponde ao email do convite

        if (normalizedEmail !== invite.email.toLowerCase()) {
            throw new BadRequestException('The registration email does not match the invite email.');
        }

        const existingEmail = await this.usersService.findByEmail(normalizedEmail);

        if (existingEmail) throw new ConflictException(ErrorMessages.AUTH.EMAIL_ALREADY_REGISTERED);

        try {
            const user = await this.usersService.create({
                name: dto.name,
                email: normalizedEmail,
                password: dto.password,
            });

            this.billingService.initializeSubscription(user).catch((err: unknown) => {
                this.logger.error(`Failed to initialize subscription for user ${user.id}`, err);
            });

            try {
                await this.organizationService.acceptInviteWithUserId(dto.inviteToken, user.id);
            } catch (error) {
                this.logger.warn(`Failed to accept invite for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`);
            }

            this.issueEmailVerification(user.id).catch((err: unknown) => {
                this.logger.error(`Failed to send email verification for user ${user.id}`, err);
            });

            return {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    isActive: user.isActive,
                    emailVerified: false,
                },
                ...(await this.issueTokens(user.id)),
            };
        } catch (error) {
            if (error instanceof QueryFailedError) {
                const dbError = error as QueryFailedError & { detail?: string };

                if (dbError.detail?.includes('email')) {
                    throw new ConflictException(ErrorMessages.AUTH.EMAIL_ALREADY_REGISTERED);
                }
            }

            throw error;
        }
    }

    async login(dto: LoginDto) {
        const normalizedEmail = dto.email.toLowerCase();

        const user = await this.usersService.findByEmail(normalizedEmail);

        if (!user) throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);

        if (!user.password) throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);

        const passwordMatch = await bcrypt.compare(dto.password, user.password);

        if (!passwordMatch) throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);

        if (!user.isActive) throw new UnauthorizedException(ErrorMessages.AUTH.ACCOUNT_INACTIVE);

        return this.issueTokens(user.id);
    }

    async refresh(token: string) {
        const hashedRefreshToken = this.hashToken(token);
        const now = new Date();

        const session = await this.sessionRepository.findOne({
            where: { token: hashedRefreshToken },
            relations: ['user'],
        });

        if (session) {
            if (session.expiresAt < now) {
                await this.sessionRepository.delete({ id: session.id });
                throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
            }

            if (!session.user?.isActive) {
                throw new UnauthorizedException(ErrorMessages.AUTH.ACCOUNT_INACTIVE);
            }

            const rotated = await this.rotateSessionTokens(session, hashedRefreshToken, now);
            if (rotated) {
                return rotated;
            }
        }

        return this.replayRotatedRefreshToken(hashedRefreshToken, now);
    }

    async logout(sessionId: string) {
        await this.sessionRepository.delete({ id: sessionId });

        return { success: true };
    }

    async createGoogleAuthCode(googleUser: {
        googleId: string;
        email: string;
        name: string;
        emailVerified?: boolean;
    }) {
        const user = await this.resolveGoogleUser(googleUser);

        return { code: await this.issueGoogleAuthCode(user.id) };
    }

    async exchangeGoogleAuthCode(code: string) {
        const codeHash = this.hashToken(code);

        const pendingCode = await this.googleAuthCodeRepository.findOne({
            where: { codeHash },
        });

        if (!pendingCode) {
            throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
        }

        if (pendingCode.usedAt || pendingCode.expiresAt < new Date()) {
            throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
        }

        const markUsedResult = await this.googleAuthCodeRepository

            .createQueryBuilder()

            .update(GoogleAuthCode)

            .set({ usedAt: new Date() })

            .where('id = :id', { id: pendingCode.id })

            .andWhere('used_at IS NULL')

            .execute();

        if (markUsedResult.affected !== 1) {
            throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
        }

        return this.issueTokens(pendingCode.userId);
    }

    async getMe(userId: string) {
        return this.getAuthUserPayload(userId);
    }

    async updateMe(userId: string, payload: { name?: string; email?: string }) {
        if (payload.email !== undefined) {
            const current = await this.usersService.findEntityById(userId);
            if (payload.email.trim().toLowerCase() !== current.email.toLowerCase()) {
                throw new BadRequestException(ErrorMessages.AUTH.EMAIL_CHANGE_NOT_ALLOWED);
            }
        }

        const { email: _ignoredEmail, ...safePayload } = payload;
        await this.usersService.update(userId, safePayload);
        return this.getAuthUserPayload(userId);
    }

    async verifyEmail(token: string): Promise<{ success: true; alreadyVerified?: boolean }> {
        const tokenHash = this.hashToken(token);
        const record = await this.emailVerificationTokenRepository.findOne({
            where: { tokenHash },
        });

        if (!record || record.usedAt || record.expiresAt < new Date()) {
            throw new BadRequestException(ErrorMessages.AUTH.INVALID_OR_EXPIRED_EMAIL_TOKEN);
        }

        const user = await this.usersService.findEntityById(record.userId);

        record.usedAt = new Date();
        await this.emailVerificationTokenRepository.save(record);

        if (user.emailVerified) {
            return { success: true, alreadyVerified: true };
        }

        await this.usersService.markEmailVerified(user.id);
        return { success: true };
    }

    async resendEmailVerification(userId: string): Promise<{ success: true; alreadyVerified?: boolean }> {
        const user = await this.usersService.findEntityById(userId);

        if (user.emailVerified) {
            return { success: true, alreadyVerified: true };
        }

        const latestToken = await this.emailVerificationTokenRepository.findOne({
            where: { userId },
            order: { createdAt: 'DESC' },
        });

        if (latestToken) {
            const elapsed = Date.now() - latestToken.createdAt.getTime();
            if (elapsed < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS) {
                throw new HttpException(
                    ErrorMessages.AUTH.EMAIL_VERIFICATION_RESEND_COOLDOWN,
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }
        }

        await this.issueEmailVerification(userId);
        return { success: true };
    }

    async updateMyPassword(
        userId: string,
        currentPassword: string | undefined,
        newPassword: string,
        currentSessionId?: string,
    ) {
        const user = await this.usersService.findEntityById(userId);

        if (user.password) {
            if (!currentPassword) {
                throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);
            }

            const isCurrentPasswordValid = await this.usersService.validatePassword(userId, currentPassword);

            if (!isCurrentPasswordValid) {
                throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);
            }
        }

        await this.usersService.updatePassword(userId, newPassword);

        // Invalidate every other session so a stolen refresh token cannot survive a password change.
        if (currentSessionId) {
            await this.sessionRepository
                .createQueryBuilder()
                .delete()
                .where('user_id = :userId', { userId })
                .andWhere('id != :currentSessionId', { currentSessionId })
                .execute();
        } else {
            await this.sessionRepository.delete({ userId });
        }

        return { success: true };
    }

    async listMySessions(userId: string, currentSessionId: string): Promise<ActiveSessionDto[]> {
        await this.enforceActiveSessionLimit(userId);

        const sessions = await this.sessionRepository.find({
            where: { userId },
            order: {
                createdAt: 'DESC',
            },
        });

        return sessions.map((session) => ({
            id: session.id,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            isCurrent: session.id === currentSessionId,
        }));
    }

    async removeMySession(userId: string, sessionId: string, currentSessionId: string) {
        const session = await this.sessionRepository.findOne({
            where: { id: sessionId, userId },
        });

        if (!session) {
            throw new NotFoundException(ErrorMessages.GENERAL.NOT_FOUND);
        }

        await this.sessionRepository.delete({ id: sessionId, userId });

        return {
            removedSessionId: sessionId,
            removedCurrent: sessionId === currentSessionId,
            success: true,
        };
    }

    private async resolveGoogleUser(googleUser: {
        googleId: string;
        email: string;
        name: string;
        emailVerified?: boolean;
    }) {
        if (googleUser.emailVerified === false) {
            throw new UnauthorizedException(ErrorMessages.AUTH.GOOGLE_EMAIL_NOT_VERIFIED);
        }

        const normalizedEmail = googleUser.email.toLowerCase();

        let user = await this.usersService.findByGoogleId(googleUser.googleId);

        if (!user) {
            const existingByEmail = await this.usersService.findByEmail(normalizedEmail);

            if (existingByEmail) {
                // Do not silently link Google to an existing password account (account-takeover vector).
                throw new ConflictException(ErrorMessages.AUTH.GOOGLE_LINK_REQUIRED);
            }

            user = await this.usersService.createWithGoogle({
                email: normalizedEmail,

                name: googleUser.name,

                googleId: googleUser.googleId,
            });

            this.billingService.initializeSubscription(user).catch((err: unknown) => {
                this.logger.error(`Failed to initialize subscription for Google user ${user?.id}`, err);
            });

            this.issueEmailVerification(user.id).catch((err: unknown) => {
                this.logger.error(`Failed to send email verification for Google user ${user?.id}`, err);
            });
        }

        if (!user!.isActive) throw new UnauthorizedException(ErrorMessages.AUTH.ACCOUNT_INACTIVE);

        return user!;
    }

    private async issueEmailVerification(userId: string): Promise<void> {
        const user = await this.usersService.findEntityById(userId);

        if (user.emailVerified) {
            return;
        }

        await this.emailVerificationTokenRepository.delete({
            userId,
            usedAt: IsNull(),
        });

        await this.emailVerificationTokenRepository.delete({
            expiresAt: LessThan(new Date()),
        });

        const token = this.generateOpaqueToken();

        await this.emailVerificationTokenRepository.save({
            tokenHash: this.hashToken(token),
            userId,
            expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
            usedAt: null,
        });

        await this.mailerService.sendEmailVerification({
            to: user.email,
            name: user.name,
            token,
        });
    }

    private async issueTokens(userId: string): Promise<AuthTokens> {
        const refreshToken = this.generateOpaqueToken();

        const session = await this.sessionRepository.save({
            userId,

            token: this.hashToken(refreshToken),

            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        });

        await this.enforceActiveSessionLimit(userId);

        return {
            accessToken: await this.signAccessToken(userId, session.id),

            refreshToken,
        };
    }

    private async rotateSessionTokens(session: UserSession, hashedRefreshToken: string, now: Date): Promise<AuthTokens | null> {
        const refreshToken = this.generateOpaqueToken();
        const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

        const updateResult = await this.sessionRepository
            .createQueryBuilder()
            .update(UserSession)
            .set({
                token: this.hashToken(refreshToken),
                previousTokenHash: hashedRefreshToken,
                rotatedAt: now,
                successorToken: this.sealRefreshToken(refreshToken),
                expiresAt,
                updatedAt: now,
            })
            .where('id = :id', { id: session.id })
            .andWhere('token = :token', { token: hashedRefreshToken })
            .execute();

        if (updateResult.affected !== 1) {
            return null;
        }

        return {
            accessToken: await this.signAccessToken(session.userId, session.id),
            refreshToken,
        };
    }

    private async replayRotatedRefreshToken(hashedRefreshToken: string, now: Date): Promise<AuthTokens> {
        const session = await this.sessionRepository.findOne({
            where: { previousTokenHash: hashedRefreshToken },
            relations: ['user'],
        });

        const rotatedAt = session?.rotatedAt?.getTime();
        const withinGrace = rotatedAt != null && now.getTime() - rotatedAt <= REFRESH_REUSE_GRACE_MS;

        if (!session?.successorToken || !withinGrace) {
            throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
        }

        if (session.expiresAt < now) {
            await this.sessionRepository.delete({ id: session.id });
            throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
        }

        if (!session.user?.isActive) {
            throw new UnauthorizedException(ErrorMessages.AUTH.ACCOUNT_INACTIVE);
        }

        this.logger.debug(`Replayed refresh token for session ${session.id} inside the rotation grace window`);

        return {
            accessToken: await this.signAccessToken(session.userId, session.id),
            refreshToken: this.openRefreshToken(session.successorToken),
        };
    }

    private async signAccessToken(userId: string, sessionId: string): Promise<string> {
        const payload: JwtPayload = { sub: userId, sessionId };

        return this.jwtService.signAsync(payload);
    }

    private async issueGoogleAuthCode(userId: string): Promise<string> {
        await this.googleAuthCodeRepository.delete({ expiresAt: LessThan(new Date()) });

        const code = this.generateOpaqueToken();

        await this.googleAuthCodeRepository.save({
            codeHash: this.hashToken(code),

            userId,

            expiresAt: new Date(Date.now() + GOOGLE_AUTH_CODE_TTL_MS),
        });

        return code;
    }

    private generateOpaqueToken(): string {
        return crypto.randomBytes(48).toString('base64url');
    }

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private getRefreshTokenKey(): Buffer {
        const dedicated = this.configService.get<string>('REFRESH_TOKEN_ENCRYPTION_KEY')?.trim();
        const material = dedicated && dedicated.length > 0 ? dedicated : this.configService.getOrThrow<string>('JWT_SECRET');
        return crypto.createHash('sha256').update(material).digest();
    }

    private sealRefreshToken(value: string): string {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.getRefreshTokenKey(), iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    }

    private openRefreshToken(payload: string): string {
        const [ivHex, authTagHex, encryptedHex] = payload.split(':');

        if (!ivHex || !authTagHex || !encryptedHex) {
            throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
        }

        const decipher = crypto.createDecipheriv('aes-256-gcm', this.getRefreshTokenKey(), Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

        return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
    }

    private async getAuthUserPayload(userId: string) {
        const user = await this.usersService.findEntityById(userId);

        return {
            id: user.id,
            email: user.email,
            name: user.name,
            isActive: user.isActive,
            hasPassword: Boolean(user.password),
            emailVerified: Boolean(user.emailVerified),
        };
    }

    private async enforceActiveSessionLimit(userId: string): Promise<void> {
        await this.sessionRepository.delete({
            userId,
            expiresAt: LessThan(new Date()),
        });

        const activeSessions = await this.sessionRepository.find({
            where: { userId },
            order: {
                updatedAt: 'DESC',
                createdAt: 'DESC',
            },
        });

        if (activeSessions.length <= MAX_ACTIVE_SESSIONS) {
            return;
        }

        const staleSessionIds = activeSessions.slice(MAX_ACTIVE_SESSIONS).map((session) => session.id);

        if (staleSessionIds.length === 0) {
            return;
        }

        await this.sessionRepository.delete({ id: In(staleSessionIds) });
    }
}
