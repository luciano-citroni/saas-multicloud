'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { VariableMap } from './variable-editor';

export function coerceParameterValue(type: string, raw: string): unknown {
    if (type === 'number') {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : raw;
    }
    if (type === 'boolean') return raw === 'true';
    return raw;
}

export function buildInitialParameters(variables: VariableMap): Record<string, string> {
    const initial: Record<string, string> = {};
    for (const [name, variable] of Object.entries(variables)) {
        if (variable.default == null || variable.default === '') {
            initial[name] = '';
            continue;
        }
        initial[name] = String(variable.default);
    }
    return initial;
}

export function parametersFromForm(variables: VariableMap, formValues: Record<string, string>): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};
    for (const [name, variable] of Object.entries(variables)) {
        const raw = formValues[name];
        if (raw == null || String(raw).trim() === '') continue;
        parameters[name] = coerceParameterValue(variable.type, String(raw));
    }
    return parameters;
}

export function ExecutionParametersForm({
    variables,
    values,
    onChange,
}: {
    variables: VariableMap;
    values: Record<string, string>;
    onChange: (name: string, value: string) => void;
}) {
    const entries = Object.entries(variables);
    if (entries.length === 0) return null;

    return (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <div>
                <p className="text-sm font-semibold">Parâmetros da execução</p>
                <p className="text-xs text-muted-foreground">Valores usados pelos blocos com binding de variável.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {entries.map(([name, variable]) => (
                    <div key={name} className="space-y-1.5">
                        <Label className="text-xs">
                            <span className="font-mono">{name}</span>
                            {variable.required !== false ? ' *' : ''}
                        </Label>
                        {variable.description ? <p className="text-[10px] text-muted-foreground">{variable.description}</p> : null}
                        {variable.type === 'boolean' ? (
                            <Select value={values[name] || undefined} onValueChange={(value) => onChange(name, value)}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="true" className="text-xs">
                                        true
                                    </SelectItem>
                                    <SelectItem value="false" className="text-xs">
                                        false
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                className="h-8 text-xs"
                                type={variable.sensitive ? 'password' : variable.type === 'number' ? 'number' : 'text'}
                                value={values[name] ?? ''}
                                placeholder={variable.default != null ? `Padrão: ${String(variable.default)}` : 'Informe o valor'}
                                onChange={(event) => onChange(name, event.target.value)}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
