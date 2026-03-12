import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { AwsKmsService } from './aws-kms.service';
import { KmsKeyResponseDto, KmsKeySyncResponseDto } from './swagger.dto';

@ApiTags('AWS KMS')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/kms')
export class AwsKmsController {
    constructor(private readonly service: AwsKmsService) {}

    @Get('accounts/:cloudAccountId/keys')
    @ApiOperation({ summary: 'Listar chaves KMS do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [KmsKeyResponseDto] })
    listKeys(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listKeysFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/keys/:keyId')
    @ApiOperation({ summary: 'Buscar chave KMS por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'keyId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: KmsKeyResponseDto })
    @ApiResponse({ status: 400, description: 'Chave não encontrada' })
    getKey(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('keyId', ParseUUIDPipe) keyId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getKeyById(keyId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/keys/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar chaves KMS da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [KmsKeySyncResponseDto] })
    syncKeys(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncKeysFromAws(cloudAccountId, org.id);
    }
}
