import { LucideIcon } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.ComponentProps<'input'> {
    StartIcon?: LucideIcon;
    ButtonIcon?: {
        icon: LucideIcon;
        onClick: () => void;
    };
}

const IconInput = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, StartIcon, ButtonIcon, ...props }, ref) => {
    return (
        <div
            className={cn(
                'flex w-full items-center overflow-hidden rounded-md border border-input bg-transparent text-base shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                className
            )}
        >
            {StartIcon && (
                <div className="flex items-center justify-center p-2 ">
                    <StartIcon className="text-foreground w-5 h-5" />
                </div>
            )}
            <input
                type={type}
                className="flex h-9 w-full bg-transparent px-1 py-1 text-base placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                ref={ref}
                {...props}
            />
            {ButtonIcon && (
                <div className="flex items-center justify-center p-2 px-3">
                    <ButtonIcon.icon className="text-foreground w-5 h-5 cursor-pointer" onClick={ButtonIcon.onClick} type="button" />
                </div>
            )}
        </div>
    );
});

IconInput.displayName = 'InputIcon';

export { IconInput };
