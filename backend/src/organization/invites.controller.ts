import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { SkipTenant } from '../tenant/tenant.decorators';
import { Public } from '../auth/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { inviteTokenParamSchema } from './dto';
import type { InviteTokenParam } from './dto';
import { AcceptInviteSuccessResponseDto, AcceptInvitePendingRegistrationResponseDto } from './swagger.dto';

/**
 * Endpoints públicos para aceitação de convites de organização.
 *
 * Não exigem autenticação — o usuário deve ter clicado no link recebido por e-mail.
 * Se o usuário não tiver conta, o endpoint retorna dados para redirecioná-lo para registro.
 */
@ApiTags('Organization Invites')
@SkipTenant()
@Controller('organization/invites')
export class InvitesController {
    constructor(private readonly organizationService: OrganizationService) {}

    /**
     * Aceita um convite de organização via token.
     * O usuário clica no link do e-mail, que chama este endpoint.
     * O token é enviado como parâmetro de rota (UUID).
     *
     * Responde com dois tipos possíveis:
     * 1. Se o usuário tem conta: "accepted" - usuário é adicionado à organização
     * 2. Se o usuário não tem conta: "needs_registration" - retorna dados para pré-registro
     */
    @Get('accept/:token')
    @Public()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Aceitar convite para a organização',
        description:
            'Endpoint público chamado ao clicar no link de convite recebido por e-mail. ' +
            'Se o usuário tem conta, é adicionado à organização. ' +
            'Se não tem, retorna dados para redirecioná-lo ao registro com pré-preenchimento.',
    })
    @ApiResponse({
        status: 200,
        description: 'Convite processado com sucesso',
        schema: {
            oneOf: [
                {
                    $ref: '#/components/schemas/AcceptInviteSuccessResponseDto',
                },
                {
                    $ref: '#/components/schemas/AcceptInvitePendingRegistrationResponseDto',
                },
            ],
        },
    })
    @ApiResponse({
        status: 400,
        description: 'Convite expirado',
        schema: {
            example: {
                statusCode: 400,
                error: 'Bad Request',
                message: 'This invite has expired.',
                path: '/api/organization/invites/accept/123e4567-e89b-12d3-a456-426614174000',
                timestamp: '2026-03-03T10:00:00.000Z',
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'Token de convite inválido ou já utilizado',
        schema: {
            example: {
                statusCode: 404,
                error: 'Not Found',
                message: 'Invite not found or has already been used.',
                path: '/api/organization/invites/accept/123e4567-e89b-12d3-a456-426614174000',
                timestamp: '2026-03-03T10:00:00.000Z',
            },
        },
    })
    @ApiResponse({
        status: 409,
        description: 'Usuário já é membro da organização',
    })
    acceptInvite(@Param(new ZodValidationPipe(inviteTokenParamSchema)) params: InviteTokenParam) {
        return this.organizationService.acceptInvite(params.token);
    }
}
