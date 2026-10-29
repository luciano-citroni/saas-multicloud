/** Build a safe Content-Disposition attachment header (no header injection). */
export function attachmentContentDisposition(fileName: string): string {
    const base = (fileName ?? '').replace(/[/\\]/g, '').split(/[/\\]/).pop() ?? 'download.bin';
    const ascii = base.replace(/[^\w.\-]+/g, '_') || 'download.bin';
    const encoded = encodeURIComponent(base);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
