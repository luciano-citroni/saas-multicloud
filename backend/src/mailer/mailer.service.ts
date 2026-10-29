import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import {
    EMAIL_BRAND,
    emailMetricRow,
    emailMetricsCard,
    escapeHtml,
    renderEmailLayout,
} from './email-layout';

@Injectable()
export class MailerService {
    private readonly logger = new Logger(MailerService.name);
    private readonly transporter: nodemailer.Transporter;

    constructor(private readonly config: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: this.config.get<string>('SMTP_HOST'),
            port: this.config.get<number>('SMTP_PORT') ?? 587,
            secure: this.config.get<string>('SMTP_SECURE') === 'true',
            auth: {
                user: this.config.get<string>('SMTP_USER'),
                pass: this.config.get<string>('SMTP_PASS'),
            },
        });
    }

    private get frontendUrl(): string {
        return (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    }

    private get fromAddress(): string {
        return this.config.get<string>('SMTP_FROM') ?? 'noreply@saas.com';
    }

    async sendOrganizationInvite(params: {
        to: string;
        organizationName: string;
        inviterName: string;
        role: string;
        token: string;
    }): Promise<void> {
        const acceptUrl = `${this.frontendUrl}/invite/accept/${params.token}`;

        const bodyHtml = `
            <p style="margin:0 0 12px;">
              <strong>${escapeHtml(params.inviterName)}</strong> convidou você para a organização
              <strong>${escapeHtml(params.organizationName)}</strong>
              com o cargo <strong>${escapeHtml(params.role)}</strong>.
            </p>
            <p style="margin:0;color:${EMAIL_BRAND.muted};">
              Aceite o convite para começar a usar a plataforma de gestão multicloud.
            </p>
        `;

        await this.transporter.sendMail({
            from: this.fromAddress,
            to: params.to,
            subject: `Convite para ${params.organizationName} · ${EMAIL_BRAND.name}`,
            html: renderEmailLayout({
                title: 'Você foi convidado',
                preheader: `${params.inviterName} convidou você para ${params.organizationName}`,
                bodyHtml,
                frontendUrl: this.frontendUrl,
                cta: { label: 'Aceitar convite', href: acceptUrl },
                footerNote:
                    'Este convite expira em 7 dias. Se você não reconhece este e-mail, ignore a mensagem.',
            }),
        });
    }

    async sendNotificationTestEmail(params: {
        to: string;
        label?: string | null;
    }): Promise<void> {
        const label = params.label?.trim();
        const notificationsUrl = `${this.frontendUrl}/tenant/notifications`;

        const bodyHtml = `
            <p style="margin:0 0 12px;">
              Este é um <strong>e-mail de teste</strong> das notificações do seu tenant
              ${label ? `no grupo <strong>${escapeHtml(label)}</strong>` : 'no SaaS MultiCloud'}.
            </p>
            <p style="margin:0 0 12px;color:${EMAIL_BRAND.muted};">
              Se você recebeu esta mensagem, o canal de e-mail está configurado corretamente e pronto para receber alertas.
            </p>
            ${emailMetricsCard(
                [
                    emailMetricRow('Destinatário', params.to),
                    emailMetricRow('Grupo', label || '—'),
                    emailMetricRow('Status', 'Entrega de teste OK'),
                ].join(''),
            )}
            <p style="margin:16px 0 0;color:${EMAIL_BRAND.muted};font-size:13px;">
              Você pode gerenciar grupos e destinatários em
              <span style="color:${EMAIL_BRAND.primary};font-weight:600;">Tenant → Notificações</span>.
            </p>
        `;

        await this.transporter.sendMail({
            from: this.fromAddress,
            to: params.to,
            subject: `E-mail de teste · ${EMAIL_BRAND.name}`,
            html: renderEmailLayout({
                title: 'Notificação de teste',
                preheader: 'Seu canal de e-mail está funcionando corretamente.',
                bodyHtml,
                frontendUrl: this.frontendUrl,
                cta: { label: 'Abrir notificações', href: notificationsUrl },
                footerNote: 'Este e-mail foi enviado manualmente a partir das configurações do tenant.',
            }),
        });
    }

    /**
     * Alerta de orçamento FinOps (e-mail).
     * Usado pelo scheduler de alertas — não deve ser chamado a cada poll de status.
     */
    async sendFinopsBudgetAlert(params: {
        to: string[];
        budgetName: string;
        usagePercentage: number;
        currentSpend: number;
        limitAmount: number;
        currency: string;
        triggeredAlerts: number[];
        scope: string;
    }): Promise<void> {
        if (params.to.length === 0) {
            return;
        }

        const thresholds = params.triggeredAlerts.map((t) => `${t}%`).join(', ') || '—';
        const scopeLabel = params.scope === 'organization' ? 'Organização' : 'Conta cloud';
        const budgetsUrl = `${this.frontendUrl}/finops/budgets`;
        const usage = params.usagePercentage.toFixed(1);
        const tone =
            params.usagePercentage >= 100
                ? EMAIL_BRAND.destructive
                : params.usagePercentage >= 80
                  ? EMAIL_BRAND.warning
                  : EMAIL_BRAND.primary;

        const bodyHtml = `
            <p style="margin:0 0 12px;">
              O orçamento <strong>${escapeHtml(params.budgetName)}</strong>
              (${escapeHtml(scopeLabel.toLowerCase())}) atingiu
              <strong style="color:${tone};">${escapeHtml(usage)}%</strong> do limite configurado.
            </p>
            ${emailMetricsCard(
                [
                    emailMetricRow('Gasto atual', `${params.currentSpend.toFixed(2)} ${params.currency}`),
                    emailMetricRow('Limite', `${params.limitAmount.toFixed(2)} ${params.currency}`),
                    emailMetricRow('Uso', `${usage}%`),
                    emailMetricRow('Limiares atingidos', thresholds),
                    emailMetricRow('Escopo', scopeLabel),
                ].join(''),
            )}
            <p style="margin:16px 0 0;color:${EMAIL_BRAND.muted};font-size:13px;">
              Revise o consumo e os limiares na área de FinOps da plataforma.
            </p>
        `;

        await this.transporter.sendMail({
            from: this.fromAddress,
            to: params.to.join(', '),
            subject: `Alerta de orçamento: ${params.budgetName} · ${EMAIL_BRAND.name}`,
            html: renderEmailLayout({
                title: 'Alerta de orçamento',
                preheader: `${params.budgetName} em ${usage}% do limite`,
                bodyHtml,
                frontendUrl: this.frontendUrl,
                cta: { label: 'Ver orçamentos', href: budgetsUrl },
                footerNote: 'Você recebe este alerta porque está cadastrado nas notificações do tenant.',
            }),
        });
    }
}
