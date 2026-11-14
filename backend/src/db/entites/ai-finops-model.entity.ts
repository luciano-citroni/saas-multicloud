import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';
import { AiFinopsProvider } from './ai-finops-provider.entity';

@Entity('ai_finops_models')
@Unique('UQ_ai_finops_models_provider_identifier', ['providerId', 'modelIdentifier'])
@Index('IDX_ai_finops_models_provider', ['providerId'])
export class AiFinopsModel {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'provider_id' })
    providerId!: string;

    @ManyToOne(() => AiFinopsProvider, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'provider_id' })
    provider!: Relation<AiFinopsProvider>;

    @Column({ type: 'varchar', length: 255, name: 'model_identifier' })
    modelIdentifier!: string;

    @Column({ type: 'varchar', length: 255, name: 'display_name' })
    displayName!: string;

    @Column({ type: 'varchar', length: 64, nullable: true })
    modality!: string | null;

    @Column({ type: 'int', name: 'context_window', nullable: true })
    contextWindow!: number | null;

    @Column({ type: 'jsonb', default: '{}' })
    capabilities!: Record<string, unknown>;

    @Column({ type: 'varchar', length: 32, default: 'active' })
    status!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
