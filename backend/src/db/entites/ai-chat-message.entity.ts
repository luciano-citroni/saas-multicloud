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
import { AiChatConversation } from './ai-chat-conversation.entity';

export type AiChatMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type AiChatSource = {
    module: string;
    label: string;
    detail?: string;
    /** Trusted in-app path built by the backend (never model-generated). */
    href?: string;
    /** Optional account to activate in the sidebar before navigating. */
    cloudAccountId?: string;
};

@Entity('ai_chat_messages')
@Index('IDX_ai_chat_messages_conversation_created', ['conversationId', 'createdAt'])
export class AiChatMessage {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'conversation_id' })
    conversationId!: string;

    @ManyToOne(() => AiChatConversation, (conversation) => conversation.messages, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversation_id' })
    conversation!: Relation<AiChatConversation>;

    @Column({ type: 'varchar', length: 20 })
    role!: AiChatMessageRole;

    @Column({ type: 'text' })
    content!: string;

    @Column({ type: 'jsonb', nullable: true })
    sources!: AiChatSource[] | null;

    @Column({ type: 'varchar', length: 100, name: 'tool_name', nullable: true })
    toolName!: string | null;

    @Column({ type: 'jsonb', name: 'token_usage', nullable: true })
    tokenUsage!: Record<string, unknown> | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
