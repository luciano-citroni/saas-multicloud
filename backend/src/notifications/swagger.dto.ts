import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNotificationGroupRequestDto {
    @ApiProperty({ example: 'FinOps' })
    name!: string;

    @ApiPropertyOptional({ example: 'Alertas de orçamento', nullable: true })
    description?: string | null;

    @ApiPropertyOptional({ example: 'email', enum: ['email', 'whatsapp'] })
    channel?: 'email' | 'whatsapp';

    @ApiPropertyOptional({ example: true })
    isActive?: boolean;
}

export class UpdateNotificationGroupRequestDto {
    @ApiPropertyOptional({ example: 'FinOps crítico' })
    name?: string;

    @ApiPropertyOptional({ nullable: true })
    description?: string | null;

    @ApiPropertyOptional({ example: true })
    isActive?: boolean;
}

export class CreateNotificationEmailRequestDto {
    @ApiProperty({ example: 'finops@empresa.com' })
    email!: string;

    @ApiPropertyOptional({ example: 'On-call', nullable: true })
    label?: string | null;

    @ApiPropertyOptional({ example: true })
    isActive?: boolean;
}

export class UpdateNotificationEmailRequestDto {
    @ApiPropertyOptional({ example: 'ops@empresa.com' })
    email?: string;

    @ApiPropertyOptional({ nullable: true })
    label?: string | null;

    @ApiPropertyOptional({ example: true })
    isActive?: boolean;
}

export class NotificationEmailResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ format: 'uuid' })
    organizationId!: string;

    @ApiProperty({ format: 'uuid' })
    groupId!: string;

    @ApiProperty({ example: 'finops@empresa.com' })
    email!: string;

    @ApiPropertyOptional({ nullable: true })
    label!: string | null;

    @ApiProperty()
    isActive!: boolean;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    updatedAt!: Date;
}

export class NotificationGroupResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ format: 'uuid' })
    organizationId!: string;

    @ApiProperty({ example: 'FinOps' })
    name!: string;

    @ApiPropertyOptional({ nullable: true })
    description!: string | null;

    @ApiProperty({ example: 'email', enum: ['email', 'whatsapp'] })
    channel!: string;

    @ApiProperty()
    isActive!: boolean;

    @ApiProperty({ type: [NotificationEmailResponseDto] })
    emails!: NotificationEmailResponseDto[];

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    updatedAt!: Date;
}

export class NotificationTestEmailResponseDto {
    @ApiProperty({ example: true })
    sent!: boolean;

    @ApiProperty({ example: 'finops@empresa.com' })
    email!: string;
}

export class NotificationTestGroupResponseDto {
    @ApiProperty({ example: 3 })
    sent!: number;

    @ApiProperty({ example: 0 })
    failed!: number;

    @ApiProperty({ example: ['finops@empresa.com', 'ops@empresa.com'], isArray: true, type: String })
    emails!: string[];
}
