import { ConflictException, Injectable, UnauthorizedException, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { UserSession } from '../db/entites/user-session.entity';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto, RegisterWithInviteDto } from './dto';
import { ErrorMessages } from '../common/messages/error-messages';
import { OrganizationService } from '../organization/organization.service';

export interface JwtPayload {
    sub: string;
    sessionId: string;
}

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(UserSession)
        private readonly sessionRepository: Repository<UserSession>,
        private readonly jwtService: JwtService,
        private readonly usersService: UsersService,
        @Inject(forwardRef(() => OrganizationService))
        private readonly organizationService: OrganizationService
    ) {}

    async register(dto: RegisterDto) {
        const normalizedEmail = dto.email.toLowerCase();
        const existingEmail = await this.usersService.findByEmail(normalizedEmail);
        if (existingEmail) throw new ConflictException(ErrorMessages.AUTH.EMAIL_ALREADY_REGISTERED);

        const existingCpf = await this.usersService.findByCpf(dto.cpf);
        if (existingCpf) throw new ConflictException(ErrorMessages.AUTH.CPF_ALREADY_REGISTERED);

        try {
            const user = await this.usersService.create({
                ...dto,
                email: normalizedEmail,
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

        const passwordMatch = await bcrypt.compare(dto.password, user.password);
        if (!passwordMatch) throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);

        if (!user.isActive) throw new UnauthorizedException(ErrorMessages.AUTH.ACCOUNT_INACTIVE);

        return this.issueTokens(user.id);
    }

    async refresh(token: string) {
        try {
            // Verificar e decodificar o JWT, permitindo desclaração mesmo se expirado
            let payload: JwtPayload;
            try {
                payload = await this.jwtService.verifyAsync(token);
            } catch (error: any) {
                // Se o token expirou, tente decodificar apenas para obter a sessão
                if (error.name === 'TokenExpiredError') {
                    payload = this.jwtService.decode(token) as JwtPayload;
                } else {
                    throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
                }
            }

            if (!payload || !payload.sessionId) {
                throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
            }

            // Buscar a sessão correspondente
            const session = await this.sessionRepository.findOne({
                where: { id: payload.sessionId },
                relations: ['user'],
            });

            if (!session) {
                throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
            }

            if (!session.user || !session.user.isActive) {
                throw new UnauthorizedException(ErrorMessages.AUTH.ACCOUNT_INACTIVE);
            }

            // Emitir novo token de acesso usando a mesma sessão
            const newPayload: JwtPayload = { sub: session.userId, sessionId: session.id };
            const accessToken = await this.jwtService.signAsync(newPayload);

            return { accessToken };
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

    async getMe(userId: string) {
        return this.usersService.findById(userId);
    }

    private async issueTokens(userId: string) {
        // Criar nova sessão para rastreamento
        const session = await this.sessionRepository.save({
            userId,
            token: this.hashToken(uuidv4()), // Gerar token genérico apenas para registro
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
        });

        const payload: JwtPayload = { sub: userId, sessionId: session.id };
        const accessToken = await this.jwtService.signAsync(payload);

        return { accessToken };
    }

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
}
