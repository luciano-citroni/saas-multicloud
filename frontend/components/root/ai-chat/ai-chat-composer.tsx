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
        <div className="border-border bg-background border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {noOrgHint ? <p className="text-muted-foreground mb-2 text-xs">{noOrgHint}</p> : null}
            <InputGroup className="border-border bg-muted/30 h-auto min-h-12 items-stretch shadow-none">
                <InputGroupTextarea
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    disabled={disabled || isStreaming}
                    aria-label={placeholder}
                    className="min-h-11 max-h-32 px-3 py-2.5 text-sm"
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            if (canSend) {
                                onSubmit();
                            }
                        }
                    }}
                />
                <InputGroupAddon align="block-end" className="justify-end gap-2 pt-0.5 pb-1.5">
                    <span className="text-muted-foreground mr-auto hidden px-1 text-[11px] lg:inline">
                        Enter · Shift+Enter
                    </span>
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
