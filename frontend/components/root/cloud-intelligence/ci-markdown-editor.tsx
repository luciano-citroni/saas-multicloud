'use client';

import { useRef } from 'react';
import {
    Bold,
    Code2,
    Heading2,
    Italic,
    Indent,
    List,
    ListOrdered,
    Outdent,
    Quote,
    Strikethrough,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Props = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    minRows?: number;
    labels: {
        bold: string;
        italic: string;
        strike: string;
        heading: string;
        bullet: string;
        numbered: string;
        quote: string;
        code: string;
        indent: string;
        outdent: string;
    };
};

type LineKind = 'heading' | 'bullet' | 'numbered' | 'quote';

const ANY_LINE_PREFIX = /^(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)/;

function wrapSelection(
    value: string,
    start: number,
    end: number,
    before: string,
    after = before,
): { next: string; selectionStart: number; selectionEnd: number } {
    const selected = value.slice(start, end) || 'text';
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    return {
        next,
        selectionStart: start + before.length,
        selectionEnd: start + before.length + selected.length,
    };
}

function getLineRange(value: string, start: number, end: number) {
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEndIdx = value.indexOf('\n', end);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    return { lineStart, lineEnd };
}

function hasKind(line: string, kind: LineKind): boolean {
    if (kind === 'heading') return /^#{1,6}\s+/.test(line);
    if (kind === 'bullet') return /^[-*+]\s+/.test(line);
    if (kind === 'numbered') return /^\d+\.\s+/.test(line);
    return /^>\s+/.test(line);
}

function stripLinePrefix(line: string): string {
    return line.replace(ANY_LINE_PREFIX, '');
}

function prefixFor(kind: LineKind, index: number): string {
    if (kind === 'heading') return '## ';
    if (kind === 'bullet') return '- ';
    if (kind === 'numbered') return `${index + 1}. `;
    return '> ';
}

function toggleLinePrefix(
    value: string,
    start: number,
    end: number,
    kind: LineKind,
): { next: string; selectionStart: number; selectionEnd: number } {
    const { lineStart, lineEnd } = getLineRange(value, start, end);
    const block = value.slice(lineStart, lineEnd);
    const rawLines = block.length === 0 ? [''] : block.split('\n');
    const allHaveKind = rawLines.every((line) => hasKind(line, kind));

    const lines = rawLines.map((line, index) => {
        const plain = stripLinePrefix(line);
        if (allHaveKind) return plain;
        return `${prefixFor(kind, index)}${plain}`;
    });

    const replaced = lines.join('\n');
    const next = `${value.slice(0, lineStart)}${replaced}${value.slice(lineEnd)}`;
    return {
        next,
        selectionStart: lineStart,
        selectionEnd: lineStart + replaced.length,
    };
}

function indentLines(
    value: string,
    start: number,
    end: number,
    outdent: boolean,
): { next: string; selectionStart: number; selectionEnd: number } {
    const { lineStart, lineEnd } = getLineRange(value, start, end);
    const block = value.slice(lineStart, lineEnd);
    const rawLines = block.length === 0 ? [''] : block.split('\n');
    const lines = rawLines.map((line) => {
        if (outdent) {
            if (line.startsWith('    ')) return line.slice(4);
            if (line.startsWith('\t')) return line.slice(1);
            if (line.startsWith('  ')) return line.slice(2);
            return line;
        }
        return `    ${line}`;
    });
    const replaced = lines.join('\n');
    const next = `${value.slice(0, lineStart)}${replaced}${value.slice(lineEnd)}`;
    return {
        next,
        selectionStart: lineStart,
        selectionEnd: lineStart + replaced.length,
    };
}

export function CiMarkdownEditor({
    value,
    onChange,
    placeholder,
    disabled,
    className,
    minRows = 14,
    labels,
}: Props) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const selectionRef = useRef({ start: 0, end: 0 });

    const rememberSelection = () => {
        const el = ref.current;
        if (!el) return;
        selectionRef.current = {
            start: el.selectionStart,
            end: el.selectionEnd,
        };
    };

    const apply = (result: { next: string; selectionStart: number; selectionEnd: number }) => {
        onChange(result.next);
        selectionRef.current = {
            start: result.selectionStart,
            end: result.selectionEnd,
        };
        requestAnimationFrame(() => {
            const el = ref.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(result.selectionStart, result.selectionEnd);
            selectionRef.current = {
                start: result.selectionStart,
                end: result.selectionEnd,
            };
        });
    };

    const run = (
        builder: (
            value: string,
            start: number,
            end: number,
        ) => { next: string; selectionStart: number; selectionEnd: number },
    ) => {
        const el = ref.current;
        const start = el?.selectionStart ?? selectionRef.current.start;
        const end = el?.selectionEnd ?? selectionRef.current.end;
        apply(builder(value, start, end));
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Tab') {
            event.preventDefault();
            run((current, start, end) => indentLines(current, start, end, event.shiftKey));
            return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
            event.preventDefault();
            run((current, start, end) => wrapSelection(current, start, end, '**'));
            return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
            event.preventDefault();
            run((current, start, end) => wrapSelection(current, start, end, '_'));
        }
    };

    const tools = [
        {
            key: 'bold',
            label: labels.bold,
            icon: Bold,
            action: () => run((current, start, end) => wrapSelection(current, start, end, '**')),
        },
        {
            key: 'italic',
            label: labels.italic,
            icon: Italic,
            action: () => run((current, start, end) => wrapSelection(current, start, end, '_')),
        },
        {
            key: 'strike',
            label: labels.strike,
            icon: Strikethrough,
            action: () => run((current, start, end) => wrapSelection(current, start, end, '~~')),
        },
        {
            key: 'heading',
            label: labels.heading,
            icon: Heading2,
            action: () => run((current, start, end) => toggleLinePrefix(current, start, end, 'heading')),
        },
        {
            key: 'bullet',
            label: labels.bullet,
            icon: List,
            action: () => run((current, start, end) => toggleLinePrefix(current, start, end, 'bullet')),
        },
        {
            key: 'numbered',
            label: labels.numbered,
            icon: ListOrdered,
            action: () => run((current, start, end) => toggleLinePrefix(current, start, end, 'numbered')),
        },
        {
            key: 'quote',
            label: labels.quote,
            icon: Quote,
            action: () => run((current, start, end) => toggleLinePrefix(current, start, end, 'quote')),
        },
        {
            key: 'code',
            label: labels.code,
            icon: Code2,
            action: () =>
                run((current, start, end) =>
                    start === end
                        ? wrapSelection(current, start, end, '`')
                        : wrapSelection(current, start, end, '```\n', '\n```'),
                ),
        },
        {
            key: 'indent',
            label: labels.indent,
            icon: Indent,
            action: () => run((current, start, end) => indentLines(current, start, end, false)),
        },
        {
            key: 'outdent',
            label: labels.outdent,
            icon: Outdent,
            action: () => run((current, start, end) => indentLines(current, start, end, true)),
        },
    ] as const;

    return (
        <div className={cn('overflow-hidden rounded-xl border border-border/70', className)}>
            <div className="bg-muted/40 flex flex-wrap items-center gap-0.5 border-b border-border/60 p-1.5">
                {tools.map((tool) => {
                    const Icon = tool.icon;
                    return (
                        <Button
                            key={tool.key}
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={disabled}
                            title={tool.label}
                            aria-label={tool.label}
                            onMouseDown={(event) => {
                                // Keep textarea focus/selection when clicking the toolbar.
                                event.preventDefault();
                            }}
                            onClick={tool.action}
                        >
                            <Icon className="size-3.5" />
                        </Button>
                    );
                })}
            </div>
            <Textarea
                ref={ref}
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                onChange={(event) => {
                    onChange(event.target.value);
                    selectionRef.current = {
                        start: event.target.selectionStart,
                        end: event.target.selectionEnd,
                    };
                }}
                onSelect={rememberSelection}
                onKeyUp={rememberSelection}
                onClick={rememberSelection}
                onKeyDown={onKeyDown}
                rows={minRows}
                className="min-h-64 resize-y rounded-none border-0 font-mono text-xs leading-relaxed shadow-none focus-visible:ring-0"
            />
        </div>
    );
}
