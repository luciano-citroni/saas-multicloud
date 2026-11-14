import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

export type AiFinopsProviderCapabilities = {
    validateCredentials: boolean;
    listModels: boolean;
    listProjects: boolean;
    fetchUsage: boolean;
    fetchCosts: boolean;
    fetchLimits: boolean;
    usageByUser: boolean;
    syncHistorical: boolean;
};

@Entity('ai_finops_providers')
export class AiFinopsProvider {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', length: 100 })
    name!: string;

    @Column({ type: 'varchar', length: 64, unique: true })
    slug!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ type: 'jsonb', default: '{}' })
    capabilities!: AiFinopsProviderCapabilities;

    @Column({ type: 'varchar', length: 32, default: 'active' })
    status!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
