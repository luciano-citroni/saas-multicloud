import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { ListRolesCommand, GetRoleCommand, ListAttachedRolePoliciesCommand, ListRolePoliciesCommand, type Role } from '@aws-sdk/client-iam';

import { AwsConnectorService } from '../aws-connector.service';

import { AwsIamRole } from '../../db/entites/aws-iam-role.entity';

@Injectable()
export class AwsIamRoleService {
    constructor(
        private readonly connector: AwsConnectorService,

        @InjectRepository(AwsIamRole)
        private readonly iamRoleRepository: Repository<AwsIamRole>
    ) {}

    // =========================================================================

    // Listar dados do BANCO DE DADOS (sem consultar AWS)

    // =========================================================================

    /**


     * Lista roles IAM armazenadas no banco de dados para uma CloudAccount específica.


     *


     * Filtro padrão (roleScope = 'user'):


     *   - Inclui apenas roles com path '/' (criadas explicitamente por usuários)


     *   - Exclui '/aws-service-role/' (service-linked, 100% gerenciadas pela AWS)


     *   - Exclui '/service-role/' (criadas automaticamente pelo console AWS ao configurar serviços)


     *


     * roleScope = 'all': retorna todas as roles sem filtro de path.


     */

    async listRolesFromDatabase(cloudAccountId: string, pathPrefix?: string, roleScope: 'user' | 'all' = 'user') {
        const query = this.iamRoleRepository.createQueryBuilder('role').where('role.cloudAccountId = :cloudAccountId', { cloudAccountId });

        if (pathPrefix) {
            query.andWhere('role.path LIKE :pathPrefix', { pathPrefix: `${pathPrefix}%` });
        } else if (roleScope === 'user') {
            // Apenas roles com path raiz '/' — garantidamente criadas por usuários

            query.andWhere("role.path = '/'");
        }

        const roles = await query.orderBy('role.roleName', 'ASC').getMany();

        return roles.map(mapDbRole);
    }

    /**


     * Busca uma role IAM específica pelo ID do banco de dados.


     */

    async getRoleById(roleId: string, cloudAccountId: string) {
        const role = await this.iamRoleRepository

            .createQueryBuilder('role')

            .where('role.id = :roleId', { roleId })

            .andWhere('role.cloudAccountId = :cloudAccountId', { cloudAccountId })

            .getOne();

        if (!role) {
            throw new BadRequestException(`Role IAM com ID "${roleId}" não encontrada.`);
        }

        return mapDbRole(role);
    }

    // =========================================================================

    // Sincronizar AWS → Banco de Dados

    // =========================================================================

    /**


     * Sincroniza roles IAM da AWS para o banco de dados.


     *


     * roleScope = 'user' (padrão): sincroniza apenas roles com path '/'


     * roleScope = 'all': sincroniza todas as roles (incluindo /service-role/ e /aws-service-role/)


     */

    async syncRolesFromAws(cloudAccountId: string, organizationId: string, pathPrefix?: string, roleScope: 'user' | 'all' = 'user') {
        const iam = await this.connector.getIamClient(cloudAccountId, organizationId);

        // Para roleScope 'user', usa PathPrefix '/' e filtra depois

        // A API do IAM não suporta filtrar exatamente por path='/', então filtramos no loop

        const allRoles: Role[] = [];

        let marker: string | undefined;

        do {
            const response = await iam

                .send(
                    new ListRolesCommand({
                        PathPrefix: pathPrefix ?? '/',

                        Marker: marker,

                        MaxItems: 100,
                    })
                )

                .catch(() => {
                    throw new BadRequestException('Falha ao listar roles IAM na AWS. Verifique as permissões da role (iam:ListRoles).');
                });

            allRoles.push(...(response.Roles ?? []));

            marker = response.IsTruncated ? response.Marker : undefined;
        } while (marker);

        const now = new Date();

        const syncedRoles: any[] = [];

        for (const awsRole of allRoles) {
            if (!awsRole.RoleId || !awsRole.Arn || !awsRole.RoleName) continue;

            // Filtra para incluir apenas roles criadas por usuários (path raiz '/')

            if (!pathPrefix && roleScope === 'user' && awsRole.Path !== '/') continue;

            // Busca detalhes completos da role (inclui RoleLastUsed)

            const { Role: roleDetail } = await iam.send(new GetRoleCommand({ RoleName: awsRole.RoleName })).catch(() => {
                throw new BadRequestException(`Falha ao descrever role "${awsRole.RoleName}" (iam:GetRole).`);
            });

            if (!roleDetail) continue;

            // Lista políticas gerenciadas anexadas

            // roleScope=user (sem pathPrefix custom): mantém apenas customer-managed (criadas na conta)

            const includeAwsManagedPolicies = roleScope === 'all' || !!pathPrefix;

            const attachedPolicies = await this.listAttachedPolicies(iam, awsRole.RoleName, includeAwsManagedPolicies);

            // Lista nomes das políticas inline (sempre criadas pelo usuário na conta)

            const inlinePolicyNames = await this.listInlinePolicyNames(iam, awsRole.RoleName);

            const roleData = mapAwsRole(roleDetail, attachedPolicies, inlinePolicyNames);

            syncedRoles.push(roleData);

            // Upsert no banco

            let dbRole = await this.iamRoleRepository.findOne({
                where: { awsRoleId: roleData.awsRoleId },
            });

            if (dbRole) {
                dbRole.roleArn = roleData.roleArn;

                dbRole.roleName = roleData.roleName;

                dbRole.path = roleData.path;

                dbRole.description = roleData.description;

                dbRole.assumeRolePolicyDocument = roleData.assumeRolePolicyDocument;

                dbRole.maxSessionDuration = roleData.maxSessionDuration;

                dbRole.permissionsBoundaryArn = roleData.permissionsBoundaryArn;

                dbRole.attachedPolicies = roleData.attachedPolicies;

                dbRole.inlinePolicyNames = roleData.inlinePolicyNames;

                dbRole.roleLastUsed = roleData.roleLastUsed;

                dbRole.createdDateAws = roleData.createdDateAws;

                dbRole.tags = roleData.tags;

                dbRole.lastSyncedAt = now;
            } else {
                dbRole = this.iamRoleRepository.create({
                    cloudAccountId,

                    awsRoleId: roleData.awsRoleId,

                    roleArn: roleData.roleArn,

                    roleName: roleData.roleName,

                    path: roleData.path,

                    description: roleData.description,

                    assumeRolePolicyDocument: roleData.assumeRolePolicyDocument,

                    maxSessionDuration: roleData.maxSessionDuration,

                    permissionsBoundaryArn: roleData.permissionsBoundaryArn,

                    attachedPolicies: roleData.attachedPolicies,

                    inlinePolicyNames: roleData.inlinePolicyNames,

                    roleLastUsed: roleData.roleLastUsed,

                    createdDateAws: roleData.createdDateAws,

                    tags: roleData.tags,

                    lastSyncedAt: now,
                });
            }

            await this.iamRoleRepository.save(dbRole);
        }

        return syncedRoles;
    }

    // =========================================================================

    // Helpers privados

    // =========================================================================

    private async listAttachedPolicies(
        iam: any,

        roleName: string,

        includeAwsManagedPolicies = true
    ): Promise<{ policyName: string; policyArn: string }[]> {
        const policies: { policyName: string; policyArn: string }[] = [];

        let marker: string | undefined;

        do {
            const response = await iam

                .send(
                    new ListAttachedRolePoliciesCommand({
                        RoleName: roleName,

                        Marker: marker,
                    })
                )

                .catch((err: any) => {
                    console.warn(`Falha ao listar políticas anexadas da role "${roleName}":`, err.message);

                    return { AttachedPolicies: [], IsTruncated: false };
                });

            for (const policy of response.AttachedPolicies ?? []) {
                if (!policy.PolicyName || !policy.PolicyArn) continue;

                if (!includeAwsManagedPolicies && isAwsManagedPolicyArn(policy.PolicyArn)) continue;

                policies.push({ policyName: policy.PolicyName, policyArn: policy.PolicyArn });
            }

            marker = response.IsTruncated ? response.Marker : undefined;
        } while (marker);

        return policies;
    }

    private async listInlinePolicyNames(iam: any, roleName: string): Promise<string[]> {
        const names: string[] = [];

        let marker: string | undefined;

        do {
            const response = await iam

                .send(
                    new ListRolePoliciesCommand({
                        RoleName: roleName,

                        Marker: marker,
                    })
                )

                .catch((err: any) => {
                    console.warn(`Falha ao listar políticas inline da role "${roleName}":`, err.message);

                    return { PolicyNames: [], IsTruncated: false };
                });

            names.push(...(response.PolicyNames ?? []));

            marker = response.IsTruncated ? response.Marker : undefined;
        } while (marker);

        return names;
    }
}

// ---------------------------------------------------------------------------

// Mappers

// ---------------------------------------------------------------------------

function parseTags(tags: { Key?: string; Value?: string }[] | undefined): Record<string, string> {
    return (tags ?? []).reduce<Record<string, string>>((acc, { Key, Value }) => {
        if (Key) acc[Key] = Value ?? '';

        return acc;
    }, {});
}

function parseAssumeRolePolicyDocument(encoded: string | undefined): Record<string, any> | null {
    if (!encoded) return null;

    try {
        return JSON.parse(decodeURIComponent(encoded));
    } catch {
        return null;
    }
}

function mapAwsRole(role: Role, attachedPolicies: { policyName: string; policyArn: string }[], inlinePolicyNames: string[]) {
    return {
        awsRoleId: role.RoleId!,

        roleArn: role.Arn!,

        roleName: role.RoleName!,

        path: role.Path ?? '/',

        description: role.Description ?? null,

        assumeRolePolicyDocument: parseAssumeRolePolicyDocument(role.AssumeRolePolicyDocument),

        maxSessionDuration: role.MaxSessionDuration ?? 3600,

        permissionsBoundaryArn: role.PermissionsBoundary?.PermissionsBoundaryArn ?? null,

        attachedPolicies: attachedPolicies.length > 0 ? attachedPolicies : null,

        inlinePolicyNames: inlinePolicyNames.length > 0 ? inlinePolicyNames : null,

        roleLastUsed: role.RoleLastUsed
            ? {
                  lastUsedDate: role.RoleLastUsed.LastUsedDate ?? null,

                  region: role.RoleLastUsed.Region ?? null,
              }
            : null,

        createdDateAws: role.CreateDate ?? null,

        tags: parseTags(role.Tags),
    };
}

function mapDbRole(role: AwsIamRole) {
    return {
        id: role.id,

        cloudAccountId: role.cloudAccountId,

        awsRoleId: role.awsRoleId,

        roleArn: role.roleArn,

        roleName: role.roleName,

        path: role.path,

        description: role.description,

        assumeRolePolicyDocument: role.assumeRolePolicyDocument,

        maxSessionDuration: role.maxSessionDuration,

        permissionsBoundaryArn: role.permissionsBoundaryArn,

        attachedPolicies: role.attachedPolicies ?? [],

        inlinePolicyNames: role.inlinePolicyNames ?? [],

        roleLastUsed: role.roleLastUsed,

        createdDateAws: role.createdDateAws,

        tags: role.tags ?? {},

        lastSyncedAt: role.lastSyncedAt,

        createdAt: role.createdAt,

        updatedAt: role.updatedAt,
    };
}

function isAwsManagedPolicyArn(policyArn: string): boolean {
    return policyArn.includes(':iam::aws:policy/');
}
