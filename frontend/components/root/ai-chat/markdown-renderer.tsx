'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

function sanitizeMarkdownHref(href: string | undefined): string | null {
    if (!href) return null;
    const trimmed = href.trim();
    if (!trimmed) return null;

    // Relative in-app links only (block protocol-relative //evil.com)
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('://')) {
        return trimmed;
    }

    try {
        const url = new URL(trimmed);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url.toString();
        }
    } catch {
        return null;
    }

    return null;
}

export function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
    return (
        <div
            className={cn(
                'text-foreground max-w-none text-sm leading-7',
                '[&>:first-child]:mt-0 [&>:last-child]:mb-0',
                className,
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => (
                        <h3 className="text-foreground mt-4 mb-2 text-[15px] font-semibold tracking-tight first:mt-0">
                            {children}
                        </h3>
                    ),
                    h2: ({ children }) => (
                        <h3 className="text-foreground mt-4 mb-2 text-[15px] font-semibold tracking-tight first:mt-0">
                            {children}
                        </h3>
                    ),
                    h3: ({ children }) => (
                        <h4 className="text-foreground mt-3 mb-1.5 text-sm font-medium first:mt-0">{children}</h4>
                    ),
                    p: ({ children }) => <p className="text-foreground/90 my-2.5 leading-7">{children}</p>,
                    strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,
                    ul: ({ children }) => (
                        <ul className="marker:text-muted-foreground my-2.5 list-disc space-y-1.5 pl-5">{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="marker:text-muted-foreground my-2.5 list-decimal space-y-1.5 pl-5">{children}</ol>
                    ),
                    li: ({ children }) => <li className="leading-7 [&>p]:my-0">{children}</li>,
                    a: ({ href, children }) => {
                        const safeHref = sanitizeMarkdownHref(href);
                        if (!safeHref) {
                            return <span className="text-foreground font-medium">{children}</span>;
                        }

                        const isExternal = safeHref.startsWith('http://') || safeHref.startsWith('https://');
                        return (
                            <a
                                href={safeHref}
                                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                className="text-primary font-medium underline decoration-primary/25 underline-offset-4 hover:decoration-primary"
                            >
                                {children}
                            </a>
                        );
                    },
                    blockquote: ({ children }) => (
                        <blockquote className="border-border text-muted-foreground my-3 border-l-2 pl-3 italic">
                            {children}
                        </blockquote>
                    ),
                    hr: () => <hr className="border-border my-4" />,
                    table: ({ children }) => (
                        <div className="border-border my-3 overflow-hidden rounded-lg border">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[240px] border-collapse text-left text-xs">
                                    {children}
                                </table>
                            </div>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
                    tbody: ({ children }) => <tbody className="divide-border divide-y">{children}</tbody>,
                    tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
                    th: ({ children }) => (
                        <th className="text-muted-foreground px-3 py-2 text-[11px] font-medium tracking-wide uppercase">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="text-foreground/90 px-3 py-2 align-top text-[12px] leading-5">{children}</td>
                    ),
                    code: ({ children, className: codeClassName }) => {
                        const isBlock = Boolean(codeClassName);
                        if (isBlock) {
                            return (
                                <pre className="border-border bg-muted/40 my-3 overflow-x-auto rounded-lg border p-3">
                                    <code className="font-mono text-[12px] leading-6 whitespace-pre">{children}</code>
                                </pre>
                            );
                        }
                        return (
                            <code className="bg-muted rounded-md px-1.5 py-0.5 font-mono text-[0.8em]">
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children }) => <>{children}</>,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
