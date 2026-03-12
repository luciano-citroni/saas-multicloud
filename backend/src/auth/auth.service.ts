import { ConflictException, Injectable, UnauthorizedException, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError, LessThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserSession } from '../db/entites/user-session.entity';
import { GoogleAuthCode } from '../db/entites/google-auth-code.entity';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto, RegisterWithInviteDto } from './dto';
import { ErrorMessages } from '../common/messages/error-messages';
import { OrganizationService } from '../organization/organization.service';

export interface JwtPayload {
    sub: string;
    sessionId: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GOOGLE_AUTH_CODE_TTL_MS = 60 * 1000;

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(UserSession)
        private readonly sessionRepository: Repository<UserSession>,
        @InjectRepository(GoogleAuthCode)
        private readonly googleAuthCodeRepository: Repository<GoogleAuthCode>,
        private readonly jwtService: JwtService,
        private readonly usersService: UsersService,
        @Inject(forwardRef(() => OrganizationService))
        private readonly organizationService: OrganizationService
    ) {}

    async register(dto: RegisterDto) {
        const normalizedEmail = dto.email.toLowerCase();
        const existingEmail = await this.usersService.findByEmail(normalizedEmail);
        if (existingEmail) throw new ConflictException(ErrorMessages.AUTH.EMAIL_ALREADY_REGISTERED);

        if (dto.cpf) {
            const existingCpf = await this.usersService.findByCpf(dto.cpf);
            if (existingCpf) throw new ConflictException(ErrorMessages.AUTH.CPF_ALREADY_REGISTERED);
        }

        try {
            const user = await this.usersService.create({
                ...dto,
                email: normalizedEmail,
                cpf: dto.cpf,
                password: dto.password,
            });

            return { id: user.id, email: user.email, name: user.name, cpf: user.cpf, isActive: user.isActive };
        } catch (error) {
            if (error instanceof QueryFailedError) {
                const dbError = error as QueryFailedError & { detail?: string };
                if (dbError.detail?.includes('email')) {
                    throw new ConflictException(ErrorMessages.AUTH.EMAIL_ALREADY_REGISTERED);
                }
                if (dbError.detail?.includes('cpf')) {
                    throw new ConflictException(ErrorMessages.AUTH.CPF_ALREADY_REGISTERED);
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

        const existingCpf = await this.usersService.findByCpf(dto.cpf);
        if (existingCpf) throw new ConflictException(ErrorMessages.AUTH.CPF_ALREADY_REGISTERED);

        try {
            // Registrar o usuário
            const user = await this.usersService.create({
                name: dto.name,
                email: normalizedEmail,
                cpf: dto.cpf,
                password: dto.password,
            });

            // Aceitar o convite com o novo usuário
            try {
                await this.organizationService.acceptInviteWithUserId(dto.inviteToken, user.id);
            } catch (error) {
                // Se falhar ao aceitar o convite, ainda assim retornar os dados de login
                // (o usuário foi criado, mas o convite pode ter expirado, etc.)
                console.error(`Failed to accept invite for user ${user.id}:`, error);
            }

            // Emitir tokens para o novo usuário
            return {
                user: { id: user.id, email: user.email, name: user.name, cpf: user.cpf, isActive: user.isActive },
                ...(await this.issueTokens(user.id)),
            };
        } catch (error) {
            if (error instanceof QueryFailedError) {
                const dbError = error as QueryFailedError & { detail?: string };
                if (dbError.detail?.includes('email')) {
                    throw new ConflictException(ErrorMessages.AUTH.EMAIL_ALREADY_REGISTERED);
                }
                if (dbError.detail?.includes('cpf')) {
                    throw new ConflictException(ErrorMessages.AUTH.CPF_ALREADY_REGISTERED);
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
        try {
            const hashedRefreshToken = this.hashToken(token);
            const session = await this.sessionRepository.findOne({
                where: { token: hashedRefreshToken },
                relations: ['user'],
            });

            if (!session) {
                throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
            }

            if (session.expiresAt < new Date()) {
                await this.sessionRepository.delete({ id: session.id });
                throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
            }

            if (!session.user || !session.user.isActive) {
                throw new UnauthorizedException(ErrorMessages.AUTH.ACCOUNT_INACTIVE);
            }

            return this.rotateSessionTokens(session);
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
        }
    }

    async logout(sessionId: string) {
        await this.sessionRepository.delete({ id: sessionId });
        return { success: true };
    }

    async createGoogleAuthCode(googleUser: { googleId: string; email: string; name: string }) {
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
        return this.usersService.findById(userId);
    }

    private async resolveGoogleUser(googleUser: { googleId: string; email: string; name: string }) {
        const normalizedEmail = googleUser.email.toLowerCase();

        let user = await this.usersService.findByGoogleId(googleUser.googleId);

        if (!user) {
            const existingByEmail = await this.usersService.findByEmail(normalizedEmail);
            if (existingByEmail) {
                await this.usersService.linkGoogleAccount(existingByEmail.id, googleUser.googleId);
                user = { ...existingByEmail, googleId: googleUser.googleId } as any;
            } else {
                user = await this.usersService.createWithGoogle({
                    email: normalizedEmail,
                    name: googleUser.name,
                    googleId: googleUser.googleId,
                });
            }
        }

        if (!user!.isActive) throw new UnauthorizedException(ErrorMessages.AUTH.ACCOUNT_INACTIVE);

        return user!;
    }

    private async issueTokens(userId: string): Promise<AuthTokens> {
        const refreshToken = this.generateOpaqueToken();
        const session = await this.sessionRepository.save({
            userId,
            token: this.hashToken(refreshToken),
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        });

        return {
            accessToken: await this.signAccessToken(userId, session.id),
            refreshToken,
        };
    }

    private async rotateSessionTokens(session: UserSession): Promise<AuthTokens> {
        const refreshToken = this.generateOpaqueToken();
        session.token = this.hashToken(refreshToken);
        await this.sessionRepository.save(session);

        return {
            accessToken: await this.signAccessToken(session.userId, session.id),
            refreshToken,
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
}
