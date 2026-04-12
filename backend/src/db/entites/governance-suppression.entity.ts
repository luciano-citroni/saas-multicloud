import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Supressão de finding de governança.
 *
 * Permite que administradores marquem achados específicos como "false positives" ou
 * exceções conhecidas, para que não impactem o score nem poluam os relatórios.
 *
 * Uma supressão aplica-se quando TODOS os campos preenchidos correspondem ao finding:
 *  - organizationId: sempre obrigatório (isolamento de tenant)
 *  - cloudAccountId: null = aplica a todas as contas da organização
 *  - policyId: '*' = aplica a todas as políticas (não recomendado); ou ID específico
 *  - resourceId: null = aplica a todos os recursos do tipo; ou ID específico do recurso
 */
@Entity('governance_suppressions')
@Index('IDX_governance_suppressions_org_id', ['organizationId'])
@Index('IDX_governance_suppressions_account_id', ['cloudAccountId'])
@Index('IDX_governance_suppressions_policy_id', ['policyId'])
export class GovernanceSuppression {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /** Organização proprietária desta supressão (obrigatório — tenant isolation). */
    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    /**
     * Conta de cloud alvo. null = aplica à organização inteira.
     */
    @Column({ type: 'uuid', name: 'cloud_account_id', nullable: true })
    cloudAccountId!: string | null;

    /**
     * ID da política suprimida (ex: 'aws-s3-no-public-access').
     * Use '*' para suprimir todas as políticas (use com extrema cautela).
     */
    @Column({ type: 'varchar', length: 100, name: 'policy_id', default: '*' })
    policyId!: string;

    /**
     * ID do recurso específico a ser suprimido.
     * null = suprimir todos os recursos que violam a política.
     */
    @Column({ type: 'varchar', length: 512, name: 'resource_id', nullable: true })
    resourceId!: string | null;

    /** Justificativa obrigatória para a supressão (para auditoria). */
    @Column({ type: 'text' })
    reason!: string;

    /**
     * Data de expiração da supressão.
     * null = nunca expira (supressão permanente).
     */
    @Column({ type: 'timestamp', name: 'expires_at', nullable: true })
    expiresAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
