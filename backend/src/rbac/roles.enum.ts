/**
 * Roles disponíveis dentro de uma organização.
 *
 * Hierarquia (maior = mais permissões):
 *   OWNER(4) > ADMIN(3) > MEMBER(2) > VIEWER(1)
 *
 * O RolesGuard usa essa hierarquia: se um endpoint requer ADMIN,
 * um OWNER também passa — mas não o contrário.
 */
export enum OrgRole {
    OWNER = 'OWNER',
    ADMIN = 'ADMIN',
    MEMBER = 'MEMBER',
    VIEWER = 'VIEWER',
}

/** Nível numérico de cada role — usado pelo RolesGuard para comparação hierárquica. */
export const ROLE_HIERARCHY: Record<OrgRole, number> = {
    [OrgRole.OWNER]: 4,
    [OrgRole.ADMIN]: 3,
    [OrgRole.MEMBER]: 2,
    [OrgRole.VIEWER]: 1,
};
