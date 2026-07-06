import { z } from 'zod';

export const checkoutSessionQuerySchema = z.object({
    checkoutSessionId: z
        .string()
        .trim()
        .regex(/^cs_[A-Za-z0-9_]+$/, 'checkoutSessionId inválido')
        .optional(),
});

export type CheckoutSessionQueryDto = z.infer<typeof checkoutSessionQuerySchema>;

export const changePlanSchema = z.object({
    priceId: z
        .string()
        .trim()
        .regex(/^price_[A-Za-z0-9_]+$/, 'priceId inválido'),
});

export type ChangePlanDto = z.infer<typeof changePlanSchema>;

export const paymentMethodIdParamSchema = z.object({
    paymentMethodId: z
        .string()
        .trim()
        .regex(/^pm_[A-Za-z0-9_]+$/, 'paymentMethodId inválido'),
});

export type PaymentMethodIdParamDto = z.infer<typeof paymentMethodIdParamSchema>;
