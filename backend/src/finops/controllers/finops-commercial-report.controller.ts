import { Body, Controller, Get, HttpCode, Post, Put, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlanModuleGuard, RequirePlanModule } from '../../common/guards/plan-module.guard';
import { SystemModule } from '../../common/modules/system-modules';
import { Tenant } from '../../db/entites/tenant.entity';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { RolesGuard } from '../../rbac/roles.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { TenantGuard } from '../../tenant/tenant.guard';
import { attachmentContentDisposition } from '../../common/utils/safe-content-disposition';
import { FinopsCommercialReportService } from '../services/finops-commercial-report.service';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const rateSchema = z.object({
    month: monthSchema,
    brlPerUsd: z.number().positive(),
});
const deliverySchema = z.object({
    enabled: z.boolean(),
    emails: z.array(z.string().email()).max(50).optional(),
    alertChannels: z.array(z.enum(['email', 'whatsapp'])).max(2).optional(),
    alertNotificationGroupIds: z.array(z.string().uuid()).max(50).optional(),
});
const sendSchema = z.object({
    month: monthSchema.optional(),
});

@ApiTags('FinOps')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@RequirePlanModule(SystemModule.FINOPS)
@UseGuards(TenantGuard, RolesGuard, PlanModuleGuard)
@Controller('finops/commercial-report')
export class FinopsCommercialReportController {
    constructor(private readonly reportService: FinopsCommercialReportService) {}

    @Get()
    @ApiOperation({ summary: 'Relatório comercial do mês fechado' })
    @ApiQuery({ name: 'month', required: false, description: 'Mês fechado YYYY-MM. Padrão: mês anterior.' })
    @ApiResponse({ status: 200, description: 'Dashboard executivo agregado' })
    @ApiResponse({ status: 400, description: 'Mês ainda não fechado' })
    getReport(@Query('month') month: string | undefined, @CurrentOrganization() org: Tenant) {
        return this.reportService.getReport(org.id, month);
    }

    @Get('pdf')
    @ApiOperation({ summary: 'PDF do relatório comercial' })
    @ApiQuery({ name: 'month', required: false, description: 'Mês fechado YYYY-MM' })
    @ApiQuery({ name: 'currency', required: false, description: 'USD ou BRL' })
    @ApiQuery({ name: 'locale', required: false, description: 'pt ou en' })
    @ApiResponse({ status: 200, description: 'Arquivo PDF' })
    @ApiResponse({ status: 400, description: 'Mês ainda não fechado' })
    async downloadPdf(
        @Query('month') month: string | undefined,
        @Query('currency') currency: string | undefined,
        @Query('locale') locale: string | undefined,
        @CurrentOrganization() org: Tenant,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const viewCurrency = currency === 'USD' || currency === 'BRL' ? currency : undefined;
        const viewLocale = locale === 'en' || locale === 'pt' ? locale : undefined;
        const file = await this.reportService.renderPdf(org.id, month, viewCurrency, viewLocale);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': attachmentContentDisposition(file.filename),
            'Cache-Control': 'no-store',
        });
        return new StreamableFile(file.buffer);
    }

    @Put('exchange-rate')
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Grava a taxa BRL/USD da fatura do mês' })
    @ApiBody({ schema: { type: 'object', required: ['month', 'brlPerUsd'], properties: { month: { type: 'string' }, brlPerUsd: { type: 'number' } } } })
    @ApiResponse({ status: 200, description: 'Taxa salva' })
    @ApiResponse({ status: 403, description: 'Papel insuficiente' })
    saveRate(
        @Body(new ZodValidationPipe(rateSchema)) body: z.infer<typeof rateSchema>,
        @CurrentOrganization() org: Tenant,
    ) {
        return this.reportService.saveExchangeRate(org.id, body.month, body.brlPerUsd);
    }

    @Put('delivery')
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Configura o envio mensal do relatório comercial' })
    @ApiBody({ schema: { type: 'object', required: ['enabled', 'emails'], properties: { enabled: { type: 'boolean' }, emails: { type: 'array', items: { type: 'string' } } } } })
    @ApiResponse({ status: 200, description: 'Entrega salva' })
    @ApiResponse({ status: 400, description: 'E-mail obrigatório quando o envio está ligado' })
    saveDelivery(
        @Body(new ZodValidationPipe(deliverySchema)) body: z.infer<typeof deliverySchema>,
        @CurrentOrganization() org: Tenant,
    ) {
        return this.reportService.saveDelivery(org.id, body.enabled, {
            emails: body.emails,
            alertChannels: body.alertChannels,
            alertNotificationGroupIds: body.alertNotificationGroupIds,
        });
    }

    @Post('send')
    @Roles(OrgRole.ADMIN)
    @HttpCode(200)
    @ApiOperation({ summary: 'Envia o relatório comercial agora' })
    @ApiBody({ schema: { type: 'object', properties: { month: { type: 'string' } } } })
    @ApiResponse({ status: 200, description: 'Relatório enviado com texto e PDF em anexo' })
    sendNow(
        @Body(new ZodValidationPipe(sendSchema)) body: z.infer<typeof sendSchema>,
        @CurrentOrganization() org: Tenant,
    ) {
        return this.reportService.sendNow(org.id, body.month);
    }
}
