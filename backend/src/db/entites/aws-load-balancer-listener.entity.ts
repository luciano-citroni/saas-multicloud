import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { AwsLoadBalancer } from './aws-load-balancer.entity';

/**


 * Protocolo do listener


 */

export enum ListenerProtocol {
    HTTP = 'HTTP',

    HTTPS = 'HTTPS',

    TCP = 'TCP',

    TLS = 'TLS',

    UDP = 'UDP',

    TCP_UDP = 'TCP_UDP',
}

/**


 * Ação padrão do listener


 */

export enum ListenerActionType {
    FORWARD = 'forward',

    REDIRECT = 'redirect',

    FIXED_RESPONSE = 'fixed-response',

    AUTHENTICATE_COGNITO = 'authenticate-cognito',

    AUTHENTICATE_OIDC = 'authenticate-oidc',
}

/**


 * Representa um Listener de Load Balancer sincronizado da Amazon Web Services.


 *


 * Isolamento de tenant:


 * - O Listener está vinculado ao LoadBalancer, que pertence à CloudAccount.


 * - Sempre filtrar por loadBalancer.cloudAccount.organizationId para garantir isolamento.


 */

@Entity('aws_load_balancer_listeners')
export class AwsLoadBalancerListener {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**


     * ID do Load Balancer no banco de dados.


     */

    @Column({ type: 'uuid', name: 'load_balancer_id' })
    loadBalancerId!: string;

    /**


     * ARN do Listener na AWS.


     */

    @Column({ type: 'varchar', length: 255, name: 'aws_listener_arn', unique: true })
    awsListenerArn!: string;

    /**


     * Porta do listener.


     */

    @Column({ type: 'integer', name: 'port' })
    port!: number;

    /**


     * Protocolo do listener (HTTP, HTTPS, TCP, TLS, UDP, TCP_UDP).


     */

    @Column({
        type: 'enum',

        enum: ListenerProtocol,

        name: 'protocol',
    })
    protocol!: ListenerProtocol;

    /**


     * ARN do certificado SSL/TLS (apenas para HTTPS e TLS).


     */

    @Column({ type: 'varchar', length: 255, name: 'ssl_certificate_arn', nullable: true })
    sslCertificateArn!: string | null;

    /**


     * Política de SSL (apenas para HTTPS e TLS).


     */

    @Column({ type: 'varchar', length: 100, name: 'ssl_policy', nullable: true })
    sslPolicy!: string | null;

    /**


     * ARN do Target Group padrão.


     */

    @Column({ type: 'varchar', length: 255, name: 'default_target_group_arn', nullable: true })
    defaultTargetGroupArn!: string | null;

    /**


     * Ações padrão do listener em JSON.


     */

    @Column({ type: 'jsonb', name: 'default_actions' })
    defaultActions!: Record<string, any>[];

    /**


     * Regras adicionais do listener em JSON.


     */

    @Column({ type: 'jsonb', name: 'rules', nullable: true })
    rules!: Record<string, any>[] | null;

    /**


     * Timestamp da última sincronização com AWS.


     */

    @Column({ type: 'timestamp', name: 'last_synced_at', nullable: true })
    lastSyncedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => AwsLoadBalancer, (lb) => lb.listeners, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'load_balancer_id' })
    loadBalancer!: AwsLoadBalancer;
}
