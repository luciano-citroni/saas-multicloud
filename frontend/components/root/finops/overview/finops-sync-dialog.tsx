'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const syncSchema = z.object({
    granularity: z.enum(['daily', 'monthly']),
    startDate: z.string().min(1, 'Data de início é obrigatória'),
    endDate: z.string().min(1, 'Data de fim é obrigatória'),
}).refine((data) => data.startDate <= data.endDate, {
    message: 'Data de início deve ser anterior ou igual à data de fim',
    path: ['endDate'],
});

type SyncFormData = z.infer<typeof syncSchema>;

type FinopsSyncDialogProps = {
    open: boolean;
    cloudProvider: string;
    onConfirm: (granularity: 'daily' | 'monthly', startDate: string, endDate: string) => void;
    onCancel: () => void;
    isLoading?: boolean;
};

function getDefaultDates() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
    };
}

export function FinopsSyncDialog({ open, cloudProvider, onConfirm, onCancel, isLoading = false }: FinopsSyncDialogProps) {
    const { startDate, endDate } = getDefaultDates();

    const form = useForm<SyncFormData>({
        resolver: zodResolver(syncSchema),
        defaultValues: {
            granularity: 'daily',
            startDate,
            endDate,
        },
    });

    const onSubmit = (data: SyncFormData) => {
        onConfirm(data.granularity, data.startDate, data.endDate);
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !isLoading) onCancel(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Sincronizar dados de custo</DialogTitle>
                    <DialogDescription>
                        Configure o período e granularidade para coleta de dados financeiros da conta <strong className="uppercase">{cloudProvider}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="granularity"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Granularidade</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="daily">Diária</SelectItem>
                                            <SelectItem value="monthly">Mensal</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-3">
                            <FormField
                                control={form.control}
                                name="startDate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Data de início</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="endDate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Data de fim</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                                Cancelar
                            </Button>
                            <Button type="submit" isLoading={isLoading}>
                                Iniciar sincronização
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
