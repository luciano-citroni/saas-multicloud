import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('google_auth_codes')
export class GoogleAuthCode {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', length: 255, unique: true, name: 'code_hash' })
    codeHash!: string;

    @Column({ type: 'uuid', name: 'user_id' })
    userId!: string;

    @Column({ type: 'timestamp', name: 'expires_at' })
    expiresAt!: Date;

    @Column({ type: 'timestamp', name: 'used_at', nullable: true })
    usedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
