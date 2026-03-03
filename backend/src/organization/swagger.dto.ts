import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationRequestDto {
    @ApiProperty({
        example: 'ACME Corporation',
        description: 'Nome da organização',
        minLength: 2,
        maxLength: 100,
    })
    name: string;

    @ApiProperty({
        example: '12345678000190',
        description: 'CNPJ da organização',
        minLength: 11,
        maxLength: 20,
    })
    cnpj: string;
}

export class UpdateOrganizationRequestDto {
    @ApiProperty({
        example: 'Updated ACME',
        description: 'Novo nome da organização',
        required: false,
        minLength: 2,
        maxLength: 100,
    })
    name?: string;

    @ApiProperty({
        example: '12345678000190',
        description: 'Novo CNPJ da organização',
        required: false,
    })
    cnpj?: string;
}

export class OrganizationResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID único da organização (UUID)',
    })
    id: string;

    @ApiProperty({
        example: 'ACME Corporation',
        description: 'Nome da organização',
    })
    name: string;

    @ApiProperty({
        example: '12345678000190',
        description: 'CNPJ da organização',
    })
    cnpj: string;
}

export class DeleteOrganizationResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID da organização deletada',
    })
    id: string;

    @ApiProperty({
        example: true,
        description: 'Confirmação de deleção',
    })
    deleted: boolean;
}

export class InviteMemberRequestDto {
    @ApiProperty({
        example: 'jane.doe@example.com',
        description: 'E-mail do usuário a ser convidado',
        format: 'email',
    })
    email: string;

    @ApiProperty({
        example: 'MEMBER',
        description: 'Cargo que será atribuído ao usuário ao aceitar o convite',
        enum: ['ADMIN', 'MEMBER', 'VIEWER'],
    })
    role: string;
}

export class InviteResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID único do convite (UUID)',
    })
    id: string;

    @ApiProperty({
        example: 'jane.doe@example.com',
        description: 'E-mail do usuário convidado',
    })
    email: string;

    @ApiProperty({
        example: 'MEMBER',
        description: 'Cargo atribuído ao convidado',
        enum: ['ADMIN', 'MEMBER', 'VIEWER'],
    })
    role: string;

    @ApiProperty({
        example: 'PENDING',
        description: 'Status atual do convite',
        enum: ['PENDING', 'ACCEPTED', 'EXPIRED'],
    })
    status: string;

    @ApiProperty({
        example: '2026-03-10T00:00:00.000Z',
        description: 'Data de expiração do convite (7 dias após a criação)',
    })
    expiresAt: string;
}

export class AcceptInviteResponseDto {
    @ApiProperty({
        example: 'Invite accepted successfully. You are now a member of the organization.',
        description: 'Mensagem de confirmação',
    })
    message: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID da organização',
    })
    organizationId: string;

    @ApiProperty({
        example: 'MEMBER',
        description: 'Cargo atribuído ao novo membro',
        enum: ['ADMIN', 'MEMBER', 'VIEWER'],
    })
    role: string;
}

export class AcceptInviteSuccessResponseDto {
    @ApiProperty({
        example: 'accepted',
        description: 'Status da aceitação',
    })
    status: string;

    @ApiProperty({
        example: 'Invite accepted successfully. You are now a member of the organization.',
        description: 'Mensagem de confirmação',
    })
    message: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID da organização',
    })
    organizationId: string;

    @ApiProperty({
        example: 'MEMBER',
        description: 'Cargo atribuído ao novo membro',
        enum: ['ADMIN', 'MEMBER', 'VIEWER'],
    })
    role: string;
}

export class AcceptInvitePendingRegistrationResponseDto {
    @ApiProperty({
        example: 'needs_registration',
        description: 'Status indicando que o usuário precisa se registrar',
    })
    status: string;

    @ApiProperty({
        example: 'No account found with this email. Please register to accept this invite.',
        description: 'Mensagem explicando o próximo passo',
    })
    message: string;

    @ApiProperty({
        example: 'user@example.com',
        description: 'Email do usuário para o qual o convite foi enviado',
    })
    email: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID da organização',
    })
    organizationId: string;

    @ApiProperty({
        example: 'ACME Corporation',
        description: 'Nome da organização',
    })
    organizationName: string;

    @ApiProperty({
        example: 'MEMBER',
        description: 'Cargo que será atribuído após aceitar',
        enum: ['ADMIN', 'MEMBER', 'VIEWER'],
    })
    role: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'Token do convite para usar no endpoint de registro',
        format: 'uuid',
    })
    inviteToken: string;
}

export class MemberResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID do registro de membro',
    })
    id: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID do usuário',
    })
    userId: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID da organização',
    })
    organizationId: string;

    @ApiProperty({
        example: 'MEMBER',
        description: 'Cargo do usuário na organização',
        enum: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'],
    })
    role: string;

    @ApiProperty({
        example: '2026-01-01T00:00:00.000Z',
        description: 'Data em que o usuário entrou na organização',
    })
    joinedAt: string;
}

export class UpdateMemberRoleRequestDto {
    @ApiProperty({
        example: 'ADMIN',
        description: 'Novo cargo do membro na organização (não é possível definir OWNER)',
        enum: ['ADMIN', 'MEMBER', 'VIEWER'],
    })
    role: string;
}

export class RemoveMemberResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID do usuário removido da organização',
    })
    userId: string;

    @ApiProperty({
        example: true,
        description: 'Confirmação de remoção',
    })
    removed: boolean;
}
