import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
    type Relation,
} from 'typeorm';
import { AiFinopsTeam } from './ai-finops-team.entity';
import { User } from './user.entity';

@Entity('ai_finops_team_members')
@Unique('UQ_ai_finops_team_members_team_user', ['teamId', 'userId'])
@Index('IDX_ai_finops_team_members_user', ['userId'])
export class AiFinopsTeamMember {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'team_id' })
    teamId!: string;

    @ManyToOne(() => AiFinopsTeam, (team) => team.members, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'team_id' })
    team!: Relation<AiFinopsTeam>;

    @Column({ type: 'uuid', name: 'user_id' })
    userId!: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user!: Relation<User>;

    @Column({ type: 'varchar', length: 32, name: 'role_in_team', default: 'member' })
    roleInTeam!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
