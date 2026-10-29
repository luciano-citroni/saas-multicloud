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

export class CreateNotificationWhatsappTargetRequestDto {
    @ApiProperty({ example: 'phone', enum: ['phone', 'group'] })
    targetType!: 'phone' | 'group';

    @ApiProperty({ example: '5511999999999', description: 'Phone E.164 digits or group JID (...@g.us)' })
    target!: string;

    @ApiPropertyOptional({ example: 'On-call', nullable: true })
    label?: string | null;

    @ApiPropertyOptional({ example: true })
    isActive?: boolean;
}

export class UpdateNotificationWhatsappTargetRequestDto {
    @ApiPropertyOptional({ example: 'phone', enum: ['phone', 'group'] })
    targetType?: 'phone' | 'group';

    @ApiPropertyOptional({ example: '5511888888888' })
    target?: string;

    @ApiPropertyOptional({ nullable: true })
    label?: string | null;

    @ApiPropertyOptional({ example: true })
    isActive?: boolean;
}

export class JoinWhatsappGroupInviteRequestDto {
    @ApiProperty({
        example: 'https://chat.whatsapp.com/L3aExanF53C2zIpFzU6B73',
        description: 'Link ou código de convite do grupo WhatsApp',
    })
    inviteLink!: string;

    @ApiPropertyOptional({ example: 'Time FinOps', nullable: true })
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

export class NotificationWhatsappTargetResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ format: 'uuid' })
    organizationId!: string;

    @ApiProperty({ format: 'uuid' })
    groupId!: string;

    @ApiProperty({ example: 'phone', enum: ['phone', 'group'] })
    targetType!: string;

    @ApiProperty({ example: '5511999999999' })
    target!: string;

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

    @ApiPropertyOptional({ type: [NotificationWhatsappTargetResponseDto] })
    whatsappTargets?: NotificationWhatsappTargetResponseDto[];

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

export class NotificationTestWhatsappTargetResponseDto {
    @ApiProperty({ example: true })
    sent!: boolean;

    @ApiProperty({ example: '5511999999999' })
    target!: string;

    @ApiProperty({ example: 'phone' })
    targetType!: string;
}

export class NotificationTestGroupResponseDto {
    @ApiProperty({ example: 3 })
    sent!: number;

    @ApiProperty({ example: 0 })
    failed!: number;

    @ApiPropertyOptional({ example: ['finops@empresa.com'], isArray: true, type: String })
    emails?: string[];

    @ApiPropertyOptional({ example: ['5511999999999'], isArray: true, type: String })
    targets?: string[];
}
