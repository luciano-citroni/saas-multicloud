import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../db/entites/user.entity';
import type { CreateUserDto, UpdateUserDto } from './dto';
import { ErrorMessages } from '../common/messages/error-messages';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>
    ) {}

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { email: email.toLowerCase() } });
    }

    async findByCpf(cpf: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { cpf } });
    }

    private sanitizeUser(user: User): Omit<User, 'password' | 'sessions' | 'organizationMemberships'> {
        const { password: _password, sessions: _sessions, organizationMemberships: _members, ...sanitized } = user;
        return sanitized as any;
    }

    async findById(id: string): Promise<Omit<User, 'password' | 'sessions' | 'organizationMemberships'>> {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        return this.sanitizeUser(user);
    }

    async create(dto: CreateUserDto): Promise<Omit<User, 'password' | 'sessions' | 'organizationMemberships'>> {
        const hashedPassword = await bcrypt.hash(dto.password, 12);
        const user = this.userRepository.create({
            ...dto,
            email: dto.email.toLowerCase(),
            password: hashedPassword,
            isActive: true,
        });
        const savedUser = await this.userRepository.save(user);
        return this.sanitizeUser(savedUser);
    }

    async findAll(): Promise<Omit<User, 'password' | 'sessions' | 'organizationMemberships'>[]> {
        const users = await this.userRepository.find();
        return users.map((user) => this.sanitizeUser(user));
    }

    async update(id: string, payload: UpdateUserDto): Promise<Omit<User, 'password' | 'sessions' | 'organizationMemberships'>> {
        const updateData = { ...payload };
        if (updateData.email) {
            updateData.email = updateData.email.toLowerCase();
        }
        const user = await this.userRepository.preload({ id, ...updateData });

        if (!user) {
            throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        }

        const savedUser = await this.userRepository.save(user);
        return this.sanitizeUser(savedUser);
    }

    async remove(id: string): Promise<{ id: string; deleted: true }> {
        const user = await this.findById(id);

        await this.userRepository.delete({ id });

        return { id, deleted: true };
    }
}
