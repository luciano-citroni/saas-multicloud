import { collapseResourceLabels, friendlyResourceLabel } from '../../../../frontend/lib/finops/resource-label';
import { friendlyServiceLabel } from '../../../../frontend/lib/finops/service-label';

describe('friendly resource labels', () => {
    it('turns AWS usage types into short names', () => {
        expect(friendlyResourceLabel('AW-HW-8-AutoStop-Usage')).toBe('WorkSpaces por hora');
        expect(friendlyResourceLabel('AW-HW-8-0-AutoStop-User')).toBe('WorkSpaces por usuário');
        expect(friendlyResourceLabel('EBS:SnapshotUsage')).toBe('Snapshot de disco');
        expect(friendlyResourceLabel('LoadBalancerUsage')).toBe('Balanceador de carga');
        expect(friendlyResourceLabel('Fargate-vCPU-Hours:perCPU')).toBe('Fargate · vCPU');
        expect(friendlyResourceLabel('PublicIPv4:InUseAddress')).toBe('IP público em uso');
        expect(friendlyResourceLabel('PublicIPv4:IdleAddress')).toBe('IP público ocioso');
        expect(friendlyResourceLabel('NatGateway-Hours')).toBe('NAT Gateway');
        expect(friendlyResourceLabel('BoxUsage:t3.large')).toBe('EC2 t3.large');
        expect(friendlyResourceLabel('BoxUsage:t3a.large')).toBe('EC2 t3a.large');
        expect(friendlyResourceLabel('EBS:VolumeUsage.gp3')).toBe('Disco gp3');
        expect(friendlyResourceLabel('Small-SimpleAD-Usage')).toBe('Simple AD');
        expect(friendlyResourceLabel('USE2-AWS-Out-Bytes')).toBe('Saída de dados');
        expect(friendlyResourceLabel('AW-HW-8-0-AutoStop-User', 'en')).toBe('WorkSpaces per user');
    });

    it('translates service names used in the chart legend', () => {
        expect(friendlyServiceLabel('EC2 - Other', 'pt')).toBe('EC2 · outros');
        expect(friendlyServiceLabel('EC2 - Other', 'en')).toBe('EC2 · other');
        expect(friendlyServiceLabel('Amazon Virtual Private Cloud', 'pt')).toBe('Rede (VPC)');
        expect(friendlyServiceLabel('Amazon Virtual Private Cloud', 'en')).toBe('Network (VPC)');
        expect(friendlyServiceLabel('Amazon Elastic Load Balancing', 'pt')).toBe('Balanceador de carga');
        expect(friendlyServiceLabel('Amazon Elastic Load Balancing', 'en')).toBe('Load balancer');
    });

    it('merges usage types that mean the same thing', () => {
        expect(
            collapseResourceLabels(
                [
                    { name: 'DataTransfer-Out-Bytes', amount: 2 },
                    { name: 'USE2-AWS-Out-Bytes', amount: 3 },
                    { name: 'BoxUsage:t3.large', amount: 10 },
                ],
                'pt',
            ),
        ).toEqual([
            { name: 'EC2 t3.large', amount: 10 },
            { name: 'Saída de dados', amount: 5 },
        ]);
    });
});
