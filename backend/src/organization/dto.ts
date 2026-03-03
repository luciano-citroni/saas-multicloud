import { z } from 'zod';
import { OrgRole } from '../rbac/roles.enum';

const organizationIdSchema = z.string().uuid();
const userIdSchema = z.string().uuid();
const inviteTokenSchema = z.string().uuid();

const organizationBaseSchema = z.object({
    name: z.string().min(2).max(100),
    cnpj: z.string().min(11).max(20).optional().nullable(),
});

export const createOrganizationSchema = organizationBaseSchema;
export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = organizationBaseSchema.partial();
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;

export const organizationIdParamSchema = z.object({
    id: organizationIdSchema,
});
export type OrganizationIdParam = z.infer<typeof organizationIdParamSchema>;

export const inviteMemberSchema = z.object({
    email: z.string().email(),
    role: z.nativeEnum(OrgRole).refine((r) => r !== OrgRole.OWNER, {
        message: 'Cannot invite a user directly as OWNER.',
    }),
});
export type InviteMemberDto = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
    role: z.nativeEnum(OrgRole).refine((r) => r !== OrgRole.OWNER, {
        message: 'Cannot promote a member to OWNER through this endpoint.',
    }),
});
export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleSchema>;

export const memberUserIdParamSchema = z.object({
    userId: userIdSchema,
});
export type MemberUserIdParam = z.infer<typeof memberUserIdParamSchema>;

export const inviteTokenParamSchema = z.object({
    token: inviteTokenSchema,
});
export type InviteTokenParam = z.infer<typeof inviteTokenParamSchema>;

// ─── Accept Invite Response ──────────────────────────────────────────────
// Resposta quando usuário JÁ tem conta
export const acceptInviteSuccessSchema = z.object({
    status: z.literal('accepted'),
    message: z.string(),
    organizationId: z.string().uuid(),
    role: z.string(),
});
export type AcceptInviteSuccessDto = z.infer<typeof acceptInviteSuccessSchema>;

// Resposta quando usuário NÃO tem conta (precisa se registrar)
export const acceptInvitePendingRegistrationSchema = z.object({
    status: z.literal('needs_registration'),
    message: z.string(),
    email: z.string().email(),
    organizationId: z.string().uuid(),
    organizationName: z.string(),
    role: z.string(),
    inviteToken: z.string().uuid(),
});
export type AcceptInvitePendingRegistrationDto = z.infer<typeof acceptInvitePendingRegistrationSchema>;

// Union dos dois tipos de resposta
export type AcceptInviteResponseDto = AcceptInviteSuccessDto | AcceptInvitePendingRegistrationDto;
