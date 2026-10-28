'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

export type VariableMap = Record<
    string,
    { type: string; default?: unknown; required?: boolean; description?: string; sensitive?: boolean }
>;

const variableSchema = z.object({
    name: z
        .string()
        .min(1, 'Nome é obrigatório')
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letras, números e _'),
    type: z.enum(['string', 'number', 'boolean']),
    defaultValue: z.string(),
    required: z.boolean(),
    sensitive: z.boolean(),
    description: z.string(),
});

type VariableFormValues = z.infer<typeof variableSchema>;

const emptyValues: VariableFormValues = {
    name: '',
    type: 'string',
    defaultValue: '',
    required: true,
    sensitive: false,
    description: '',
};

function toFormValues(name: string, variable: VariableMap[string]): VariableFormValues {
    return {
        name,
        type: variable.type === 'number' || variable.type === 'boolean' ? variable.type : 'string',
        defaultValue: variable.default == null ? '' : String(variable.default),
        required: variable.required !== false,
        sensitive: variable.sensitive === true,
        description: variable.description ?? '',
    };
}

export function VariableEditor({
    variables,
    onSave,
    label,
    saveLabel,
    saving,
    readOnly = false,
}: {
    variables: VariableMap;
    onSave: (value: VariableMap) => Promise<void> | void;
    label: string;
    saveLabel: string;
    saving?: boolean;
    readOnly?: boolean;
}) {
    const [editing, setEditing] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const entries = Object.entries(variables);
    const form = useForm<VariableFormValues>({
        resolver: (values, context, options) =>
            zodResolver(
                variableSchema.superRefine((data, ctx) => {
                    if (data.name !== editing && Object.prototype.hasOwnProperty.call(variables, data.name)) {
                        ctx.addIssue({ code: 'custom', path: ['name'], message: 'Já existe uma variável com esse nome' });
                    }
                    if (data.type === 'number' && data.defaultValue.trim() !== '' && Number.isNaN(Number(data.defaultValue))) {
                        ctx.addIssue({ code: 'custom', path: ['defaultValue'], message: 'Informe um número' });
                    }
                }),
            )(values, context, options),
        defaultValues: emptyValues,
    });
    const selectedType = form.watch('type');

    function startNew() {
        setEditing(null);
        setShowForm(true);
        form.reset(emptyValues);
    }

    function startEdit(name: string) {
        const variable = variables[name];
        if (!variable) return;
        setEditing(name);
        setShowForm(true);
        form.reset(toFormValues(name, variable));
    }

    async function onSubmit(data: VariableFormValues) {
        const next = { ...variables };
        if (editing && editing !== data.name) delete next[editing];
        const defaultValue =
            data.defaultValue.trim() === ''
                ? undefined
                : data.type === 'number'
                  ? Number(data.defaultValue)
                  : data.type === 'boolean'
                    ? data.defaultValue === 'true'
                    : data.defaultValue;
        next[data.name] = {
            type: data.type,
            required: data.required,
            sensitive: data.sensitive,
            ...(defaultValue !== undefined ? { default: defaultValue } : {}),
            ...(data.description.trim() ? { description: data.description.trim() } : {}),
        };
        await onSave(next);
        setEditing(data.name);
        setShowForm(false);
        form.reset(emptyValues);
    }

    return (
        <div className="rounded-xl border p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h2 className="font-semibold">{label}</h2>
                        <Badge variant="outline">{entries.length}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Defina entradas do fluxo. Na execução, o usuário informa os valores (ou usa o padrão).
                    </p>
                </div>
                {!readOnly && (
                    <Button type="button" variant="outline" size="sm" onClick={startNew}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Nova variável
                    </Button>
                )}
            </div>

            {entries.length === 0 ? (
                <div className="mb-4 rounded-lg border border-dashed px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground">Nenhuma variável ainda.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Ex.: <span className="font-mono">appName</span>, <span className="font-mono">region</span>. Use-as nos blocos como binding de variável.
                    </p>
                </div>
            ) : (
                <ul className="mb-4 space-y-2">
                    {entries.map(([name, variable]) => (
                        <li key={name} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="truncate font-mono text-sm font-medium">{name}</p>
                                    <Badge variant="secondary" className="text-[10px]">
                                        {variable.type}
                                    </Badge>
                                    {variable.required !== false && (
                                        <Badge variant="outline" className="text-[10px]">
                                            obrigatória
                                        </Badge>
                                    )}
                                    {variable.sensitive && (
                                        <Badge variant="outline" className="text-[10px]">
                                            sensível
                                        </Badge>
                                    )}
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {variable.description || 'Sem descrição'}
                                    {variable.default != null && variable.default !== ''
                                        ? ` · padrão: ${variable.sensitive ? '••••' : String(variable.default)}`
                                        : ''}
                                </p>
                            </div>
                            {!readOnly && (
                                <div className="flex shrink-0 gap-1">
                                    <Button type="button" variant="ghost" size="icon" onClick={() => startEdit(name)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            const next = { ...variables };
                                            delete next[name];
                                            void onSave(next);
                                            if (editing === name) {
                                                setShowForm(false);
                                                setEditing(null);
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {!readOnly && showForm && (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                        <p className="text-sm font-medium">{editing ? `Editando ${editing}` : 'Nova variável'}</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome</FormLabel>
                                        <FormControl>
                                            <Input placeholder="appName" className="font-mono" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tipo</FormLabel>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <FormControl>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="string">Texto</SelectItem>
                                                <SelectItem value="number">Número</SelectItem>
                                                <SelectItem value="boolean">Booleano</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="defaultValue"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Valor padrão</FormLabel>
                                        <FormControl>
                                            {selectedType === 'boolean' ? (
                                                <Select value={field.value || undefined} onValueChange={field.onChange}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Sem padrão" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="true">true</SelectItem>
                                                        <SelectItem value="false">false</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input placeholder="Usado se o usuário não informar" {...field} />
                                            )}
                                        </FormControl>
                                        <FormDescription>Preenchido automaticamente na execução se vazio.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Descrição</FormLabel>
                                        <FormControl>
                                            <Textarea rows={2} placeholder="Aparece no formulário de execução" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div className="flex flex-wrap gap-6">
                            <FormField
                                control={form.control}
                                name="required"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                        <FormControl>
                                            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                                        </FormControl>
                                        <FormLabel>Obrigatória na execução</FormLabel>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="sensitive"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                        <FormControl>
                                            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                                        </FormControl>
                                        <FormLabel>Sensível (oculta no histórico)</FormLabel>
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setShowForm(false);
                                    setEditing(null);
                                    form.reset(emptyValues);
                                }}
                            >
                                Cancelar
                            </Button>
                            <Button type="submit" isLoading={saving} loadingText="Salvando...">
                                {saveLabel}
                            </Button>
                        </div>
                    </form>
                </Form>
            )}
        </div>
    );
}
