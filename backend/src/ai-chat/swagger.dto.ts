import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationRequestDto {
    @ApiPropertyOptional({ maxLength: 200 })
    title?: string;
}

export class SendMessageRequestDto {
    @ApiProperty({ maxLength: 4000 })
    content!: string;

    @ApiPropertyOptional({ format: 'uuid' })
    cloudAccountId?: string;
}

export class AiChatSourceDto {
    @ApiProperty()
    module!: string;

    @ApiProperty()
    label!: string;

    @ApiPropertyOptional()
    detail?: string;

    @ApiPropertyOptional({ description: 'Trusted in-app path for deep-linking' })
    href?: string;

    @ApiPropertyOptional({ format: 'uuid' })
    cloudAccountId?: string;
}

export class AiChatMessageResponseDto {
    @ApiProperty()
    id!: string;

    @ApiProperty({ enum: ['user', 'assistant', 'system', 'tool'] })
    role!: string;

    @ApiProperty()
    content!: string;

    @ApiPropertyOptional({ type: [AiChatSourceDto] })
    sources?: AiChatSourceDto[] | null;

    @ApiProperty()
    createdAt!: Date;
}

export class AiChatConversationResponseDto {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    title!: string;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    updatedAt!: Date;
}

export class AiChatConversationDetailResponseDto extends AiChatConversationResponseDto {
    @ApiProperty({ type: [AiChatMessageResponseDto] })
    messages!: AiChatMessageResponseDto[];
}
