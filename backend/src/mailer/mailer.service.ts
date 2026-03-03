import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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

    async sendOrganizationInvite(params: {
        to: string;
        organizationName: string;
        inviterName: string;
        role: string;
        token: string;
    }): Promise<void> {
        const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
        const acceptUrl = `${appUrl}/api/organization/invites/accept/${params.token}`;

        await this.transporter.sendMail({
            from: this.config.get<string>('SMTP_FROM') ?? 'noreply@saas.com',
            to: params.to,
            subject: `Convite para a organização ${params.organizationName}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Você foi convidado!</h2>
                    <p>
                        <strong>${params.inviterName}</strong> convidou você para se juntar à organização
                        <strong>${params.organizationName}</strong> com o cargo <strong>${params.role}</strong>.
                    </p>
                    <p>Para aceitar o convite, clique no botão abaixo:</p>
                    <a
                        href="${acceptUrl}"
                        style="display:inline-block;padding:12px 24px;background-color:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;"
                    >
                        Aceitar Convite
                    </a>
                    <p style="color:#888;margin-top:24px;font-size:12px;">
                        Este convite expira em 7 dias.<br>
                        Caso não reconheça este convite, ignore este e-mail.
                    </p>
                </div>
            `,
        });
    }
}
