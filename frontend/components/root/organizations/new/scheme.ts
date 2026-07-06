import z from 'zod';
import { isValidCNPJ } from '@/lib/validators/cnpj';

export type OrganizationFormValues = {
    name: string;
    cnpj?: string;
};

export type OrganizationSchemaMessages = {
    nameMin: string;
    cnpjInvalid: string;
};

export function createOrganizationSchema(msgs: OrganizationSchemaMessages) {
    return z.object({
        name: z.string().min(2, msgs.nameMin),
        cnpj: z.string().optional().refine((val) => !val || isValidCNPJ(val), msgs.cnpjInvalid),
    });
}

export const organizationFormScheme = createOrganizationSchema({
    nameMin: 'Informe um nome com pelo menos 2 caracteres.',
    cnpjInvalid: 'CNPJ inválido.',
});
