import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Organization } from './organization.entity';
import { AiFinopsTeamMember } from './ai-finops-team-member.entity';

@Entity('ai_finops_teams')
@Index('IDX_ai_finops_teams_tenant_org', ['tenantId', 'organizationId'])
export class AiFinopsTeam {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Relation<Organization>;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ type: 'varchar', length: 32, default: 'active' })
    status!: string;

    @OneToMany(() => AiFinopsTeamMember, (member) => member.team)
    members!: Relation<AiFinopsTeamMember[]>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
