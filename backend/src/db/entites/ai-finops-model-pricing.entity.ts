import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    type Relation,
} from 'typeorm';
import { AiFinopsModel } from './ai-finops-model.entity';

@Entity('ai_finops_model_pricing')
@Index('IDX_ai_finops_model_pricing_model_effective', ['modelId', 'effectiveFrom'])
export class AiFinopsModelPricing {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'model_id' })
    modelId!: string;

    @ManyToOne(() => AiFinopsModel, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'model_id' })
    model!: Relation<AiFinopsModel>;

    @Column({ type: 'varchar', length: 64, name: 'token_type' })
    tokenType!: string;

    @Column({ type: 'varchar', length: 64, default: '1M_tokens' })
    unit!: string;

    @Column({ type: 'decimal', precision: 18, scale: 8 })
    price!: string;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'varchar', length: 64, nullable: true })
    region!: string | null;

    @Column({ type: 'timestamptz', name: 'effective_from' })
    effectiveFrom!: Date;

    @Column({ type: 'timestamptz', name: 'effective_until', nullable: true })
    effectiveUntil!: Date | null;

    @Column({ type: 'varchar', length: 128, default: 'manual' })
    source!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
