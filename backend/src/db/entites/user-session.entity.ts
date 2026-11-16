import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    type Relation
} from 'typeorm';
import { User } from './user.entity';

@Entity('users_sessions')
export class UserSession {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'user_id' })
    userId!: string;

    /** SHA-256 of refresh token — never selected by default. */
    @Column({ type: 'varchar', length: 255, select: false })
    token!: string;

    /** Previous refresh hash for rotation replay — never selected by default. */
    @Column({ type: 'varchar', length: 64, name: 'previous_token_hash', nullable: true, select: false })
    previousTokenHash!: string | null;

    @Column({ type: 'timestamp', name: 'rotated_at', nullable: true })
    rotatedAt!: Date | null;

    /** Sealed refresh for rotation grace window — never selected by default. */
    @Column({ type: 'text', name: 'successor_token', nullable: true, select: false })
    successorToken!: string | null;

    @Column({ type: 'timestamp', name: 'expires_at' })
    expiresAt!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user!: Relation<User>;
}
