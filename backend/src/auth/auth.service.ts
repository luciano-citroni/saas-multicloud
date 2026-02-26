import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { UserSession } from '../db/entites/user-session.entity';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto';
import { ErrorMessages } from '../common/messages/error-messages';

export interface JwtPayload {
    sub: string;
    email: string;
    sessionId: string;
}

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(UserSession)
        private readonly sessionRepository: Repository<UserSession>,
        private readonly jwtService: JwtService,
        private readonly usersService: UsersService
    ) {}

    async register(dto: RegisterDto) {
        const normalizedEmail = dto.email.toLowerCase();
        const existingEmail = await this.usersService.findByEmail(normalizedEmail);
        if (existingEmail) throw new ConflictException(ErrorMessages.AUTH.EMAIL_ALREADY_REGISTERED);

        const existingCpf = await this.usersService.findByCpf(dto.cpf);
        if (existingCpf) throw new ConflictException(ErrorMessages.AUTH.CPF_ALREADY_REGISTERED);

        const user = await this.usersService.create({
            ...dto,
            email: normalizedEmail,
            password: dto.password,
        });

        return { id: user.id, email: user.email, name: user.name, cpf: user.cpf, isActive: user.isActive };
    }

    async login(dto: LoginDto) {
        const normalizedEmail = dto.email.toLowerCase();
        const user = await this.usersService.findByEmail(normalizedEmail);
        if (!user) throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);

        const passwordMatch = await bcrypt.compare(dto.password, user.password);
        if (!passwordMatch) throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_CREDENTIALS);

        if (!user.isActive) throw new UnauthorizedException(ErrorMessages.AUTH.ACCOUNT_INACTIVE);

        return this.issueTokens(user.id, user.email);
    }

    async refresh(plainRefreshToken: string) {
        const tokenHash = this.hashToken(plainRefreshToken);

        const session = await this.sessionRepository.findOne({
            where: { token: tokenHash },
            relations: ['user'],
        });

        if (!session || session.expiresAt < new Date()) {
            if (session) await this.sessionRepository.remove(session);
            throw new UnauthorizedException(ErrorMessages.AUTH.INVALID_REFRESH_TOKEN);
        }

        if (!session.user || !session.user.isActive) {
            await this.sessionRepository.remove(session);
            throw new UnauthorizedException(ErrorMessages.AUTH.ACCOUNT_INACTIVE);
        }

        // Token rotation: invalidate old session, issue new tokens
        await this.sessionRepository.remove(session);
        return this.issueTokens(session.userId, session.user.email);
    }

    async logout(sessionId: string, userId: string) {
        await this.sessionRepository.delete({ id: sessionId, userId });
        return { success: true };
    }

    async getMe(userId: string) {
        return this.usersService.findById(userId);
    }

    private async issueTokens(userId: string, email: string) {
        const plainRefreshToken = uuidv4();
        const tokenHash = this.hashToken(plainRefreshToken);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const session = await this.sessionRepository.save({
            userId,
            token: tokenHash,
            expiresAt,
        });

        const payload: JwtPayload = { sub: userId, email, sessionId: session.id };
        const accessToken = await this.jwtService.signAsync(payload);

        return { accessToken, refreshToken: plainRefreshToken };
    }

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
}
