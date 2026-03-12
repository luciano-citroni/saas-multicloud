import z from 'zod';
import { isValidCNPJ } from '@/lib/validators/cnpj';

export const organizationFormScheme = z.object({
    name: z.string().min(2, 'Informe um nome com pelo menos 2 caracteres.'),
    cnpj: z
        .string()
        .optional()
        .refine((val) => !val || isValidCNPJ(val), 'CNPJ inválido.'),
});
