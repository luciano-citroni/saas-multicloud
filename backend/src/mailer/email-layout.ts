/** Brand tokens aligned with frontend `globals.css` (primary #C026D3 / Fuchsia 600). */
export const EMAIL_BRAND = {
    name: 'SaaS MultiCloud',
    primary: '#C026D3',
    primaryDark: '#A21CAF',
    foreground: '#18181B',
    muted: '#71717A',
    border: '#E4E4E7',
    background: '#F4F4F5',
    card: '#FFFFFF',
    success: '#16A34A',
    warning: '#CA8A04',
    destructive: '#EF4444',
} as const;

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export type EmailLayoutOptions = {
    title: string;
    preheader?: string;
    bodyHtml: string;
    frontendUrl?: string;
    cta?: { label: string; href: string };
    footerNote?: string;
};

/**
 * Shared transactional email shell — table-based for client compatibility.
 */
export function renderEmailLayout(options: EmailLayoutOptions): string {
    const frontendUrl = (options.frontendUrl ?? 'https://app.saas-multicloud.com').replace(/\/$/, '');
    const preheader = options.preheader?.trim()
        ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(options.preheader)}</div>`
        : '';

    const ctaBlock = options.cta
        ? `
            <tr>
              <td style="padding:8px 32px 28px;">
                <a href="${escapeHtml(options.cta.href)}"
                   style="display:inline-block;background:${EMAIL_BRAND.primary};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;line-height:1;padding:14px 22px;border-radius:10px;">
                  ${escapeHtml(options.cta.label)}
                </a>
              </td>
            </tr>`
        : '';

    const footerNote = options.footerNote?.trim()
        ? `<p style="margin:0 0 8px;color:${EMAIL_BRAND.muted};font-size:12px;line-height:1.5;">${options.footerNote}</p>`
        : '';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_BRAND.background};">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${EMAIL_BRAND.background};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:${EMAIL_BRAND.card};border:1px solid ${EMAIL_BRAND.border};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:${EMAIL_BRAND.primary};padding:22px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="display:inline-block;width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,0.18);text-align:center;line-height:34px;color:#FFFFFF;font-weight:700;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
                      SM
                    </div>
                  </td>
                  <td style="vertical-align:middle;padding-left:12px;">
                    <div style="font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;font-size:16px;font-weight:700;letter-spacing:0.01em;">
                      ${EMAIL_BRAND.name}
                    </div>
                    <div style="font-family:Arial,Helvetica,sans-serif;color:rgba(255,255,255,0.82);font-size:12px;margin-top:2px;">
                      Gestão multicloud
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 8px;font-family:Arial,Helvetica,sans-serif;">
              <h1 style="margin:0 0 16px;color:${EMAIL_BRAND.foreground};font-size:22px;line-height:1.3;font-weight:700;">
                ${escapeHtml(options.title)}
              </h1>
              <div style="color:${EMAIL_BRAND.foreground};font-size:14px;line-height:1.65;">
                ${options.bodyHtml}
              </div>
            </td>
          </tr>

          ${ctaBlock}

          <tr>
            <td style="padding:0 32px 28px;">
              <div style="height:1px;background:${EMAIL_BRAND.border};margin:8px 0 20px;"></div>
              ${footerNote}
              <p style="margin:0;color:${EMAIL_BRAND.muted};font-size:12px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">
                Enviado por <strong style="color:${EMAIL_BRAND.foreground};">${EMAIL_BRAND.name}</strong>
                · <a href="${escapeHtml(frontendUrl)}" style="color:${EMAIL_BRAND.primary};text-decoration:none;">Abrir plataforma</a>
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:16px 0 0;color:${EMAIL_BRAND.muted};font-size:11px;font-family:Arial,Helvetica,sans-serif;">
          © ${new Date().getFullYear()} ${EMAIL_BRAND.name}. Todos os direitos reservados.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailMetricRow(label: string, value: string): string {
    return `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid ${EMAIL_BRAND.border};color:${EMAIL_BRAND.muted};font-size:13px;font-family:Arial,Helvetica,sans-serif;">
          ${escapeHtml(label)}
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid ${EMAIL_BRAND.border};color:${EMAIL_BRAND.foreground};font-size:13px;font-weight:600;text-align:right;font-family:Arial,Helvetica,sans-serif;">
          ${escapeHtml(value)}
        </td>
      </tr>`;
}

export function emailMetricsCard(rowsHtml: string): string {
    return `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
             style="margin:18px 0 8px;border:1px solid ${EMAIL_BRAND.border};border-radius:12px;overflow:hidden;background:#FAFAFA;">
        ${rowsHtml}
      </table>`;
}

export { escapeHtml };
