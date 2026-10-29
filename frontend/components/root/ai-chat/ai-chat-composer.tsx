'use client';

import { ArrowUpIcon, Square } from 'lucide-react';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupTextarea,
} from '@/components/ui/input-group';

type Props = {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onStop: () => void;
    disabled?: boolean;
    isStreaming?: boolean;
    placeholder: string;
    sendLabel: string;
    stopLabel: string;
    noOrgHint?: string | null;
};

export function AiChatComposer({
    value,
    onChange,
    onSubmit,
    onStop,
    disabled,
    isStreaming,
    placeholder,
    sendLabel,
    stopLabel,
    noOrgHint,
}: Props) {
    const canSend = Boolean(value.trim()) && !disabled && !isStreaming;

    return (
        <div className="border-border bg-background border-t p-3">
            {noOrgHint ? <p className="text-muted-foreground mb-2 text-xs">{noOrgHint}</p> : null}
            <InputGroup className="border-border bg-muted/20 h-auto min-h-16 items-stretch shadow-none">
                <InputGroupTextarea
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    disabled={disabled || isStreaming}
                    aria-label={placeholder}
                    className="min-h-14 px-3"
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            if (canSend) {
                                onSubmit();
                            }
                        }
                    }}
                />
                <InputGroupAddon align="block-end" className="justify-between gap-2 pt-1">
                    <span className="text-muted-foreground px-1 text-[11px]">Enter ↵</span>
                    {isStreaming ? (
                        <InputGroupButton
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={onStop}
                            aria-label={stopLabel}
                        >
                            <Square className="size-3.5 fill-current" />
                        </InputGroupButton>
                    ) : (
                        <InputGroupButton
                            type="button"
                            variant="default"
                            size="icon-sm"
                            disabled={!canSend}
                            onClick={onSubmit}
                            aria-label={sendLabel}
                        >
                            <ArrowUpIcon />
                            <span className="sr-only">{sendLabel}</span>
                        </InputGroupButton>
                    )}
                </InputGroupAddon>
            </InputGroup>
        </div>
    );
}
