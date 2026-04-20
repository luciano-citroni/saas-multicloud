import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import {
    EC2Client,
    DescribeVpcsCommand,
    DescribeSubnetsCommand,
    DescribeSecurityGroupsCommand,
    DescribeKeyPairsCommand,
    CreateKeyPairCommand,
    DescribeImagesCommand,
} from '@aws-sdk/client-ec2';
import { AwsConnectorService } from '../aws/aws-connector.service';

const OS_PRESETS: Record<string, { owners: string[]; namePattern: string }> = {
    'amazon-linux-2023': { owners: ['amazon'], namePattern: 'al2023-ami-2023*-x86_64' },
    'ubuntu-24.04': { owners: ['099720109477'], namePattern: 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*' },
    'ubuntu-22.04': { owners: ['099720109477'], namePattern: 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*' },
    'ubuntu-20.04': { owners: ['099720109477'], namePattern: 'ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*' },
    'windows-2022': { owners: ['amazon'], namePattern: 'Windows_Server-2022-English-Full-Base-*' },
    'windows-2019': { owners: ['amazon'], namePattern: 'Windows_Server-2019-English-Full-Base-*' },
    'rhel-9': { owners: ['309956199498'], namePattern: 'RHEL-9*-x86_64-*' },
    'debian-12': { owners: ['136693071363'], namePattern: 'debian-12-amd64-*' },
};

@Injectable()
export class AwsResourcesService {
    private readonly logger = new Logger(AwsResourcesService.name);

    constructor(private readonly connector: AwsConnectorService) {}

    private async getClient(cloudAccountId: string, organizationId: string, region: string): Promise<EC2Client> {
        const creds = await this.connector.resolveRoleCredentials(cloudAccountId, organizationId);
        const temporaryCreds = await this.connector.assumeRole({ ...creds, region });
        return new EC2Client({ region, credentials: temporaryCreds });
    }

    async listVpcs(cloudAccountId: string, organizationId: string, region: string) {
        const client = await this.getClient(cloudAccountId, organizationId, region);
        const { Vpcs = [] } = await client.send(new DescribeVpcsCommand({}));
        return Vpcs.map((v) => ({
            id: v.VpcId!,
            cidr: v.CidrBlock ?? '',
            isDefault: v.IsDefault ?? false,
            name: v.Tags?.find((t) => t.Key === 'Name')?.Value ?? v.VpcId!,
        }));
    }

    async listSubnets(cloudAccountId: string, organizationId: string, region: string, vpcId?: string) {
        const client = await this.getClient(cloudAccountId, organizationId, region);
        const filters = vpcId ? [{ Name: 'vpc-id', Values: [vpcId] }] : [];
        const { Subnets = [] } = await client.send(new DescribeSubnetsCommand({ Filters: filters }));
        return Subnets.map((s) => ({
            id: s.SubnetId!,
            cidr: s.CidrBlock ?? '',
            az: s.AvailabilityZone ?? '',
            vpcId: s.VpcId ?? '',
            name: s.Tags?.find((t) => t.Key === 'Name')?.Value ?? s.SubnetId!,
        }));
    }

    async listSecurityGroups(cloudAccountId: string, organizationId: string, region: string, vpcId?: string) {
        const client = await this.getClient(cloudAccountId, organizationId, region);
        const filters = vpcId ? [{ Name: 'vpc-id', Values: [vpcId] }] : [];
        const { SecurityGroups = [] } = await client.send(new DescribeSecurityGroupsCommand({ Filters: filters }));
        return SecurityGroups.map((sg) => ({
            id: sg.GroupId!,
            name: sg.GroupName ?? sg.GroupId!,
            description: sg.Description ?? '',
            vpcId: sg.VpcId ?? '',
        }));
    }

    async listKeyPairs(cloudAccountId: string, organizationId: string, region: string) {
        const client = await this.getClient(cloudAccountId, organizationId, region);
        const { KeyPairs = [] } = await client.send(new DescribeKeyPairsCommand({}));
        return KeyPairs.map((kp) => ({
            id: kp.KeyPairId!,
            name: kp.KeyName!,
            fingerprint: kp.KeyFingerprint ?? '',
        }));
    }

    async createKeyPair(cloudAccountId: string, organizationId: string, region: string, keyName: string) {
        const client = await this.getClient(cloudAccountId, organizationId, region);
        const result = await client.send(new CreateKeyPairCommand({ KeyName: keyName, KeyType: 'rsa' }));
        if (!result.KeyMaterial) {
            throw new BadRequestException('AWS não retornou o material da chave privada');
        }
        return {
            id: result.KeyPairId!,
            name: result.KeyName!,
            keyMaterial: result.KeyMaterial,
        };
    }

    async resolveAmi(cloudAccountId: string, organizationId: string, region: string, osPreset: string) {
        const preset = OS_PRESETS[osPreset];
        if (!preset) throw new BadRequestException(`OS preset "${osPreset}" não suportado`);

        const client = await this.getClient(cloudAccountId, organizationId, region);
        const { Images = [] } = await client.send(
            new DescribeImagesCommand({
                Owners: preset.owners,
                Filters: [
                    { Name: 'name', Values: [preset.namePattern] },
                    { Name: 'architecture', Values: ['x86_64'] },
                    { Name: 'state', Values: ['available'] },
                ],
            }),
        );

        if (Images.length === 0) {
            throw new NotFoundException(`Nenhuma AMI encontrada para "${osPreset}" na região "${region}"`);
        }

        Images.sort((a, b) => (b.CreationDate ?? '').localeCompare(a.CreationDate ?? ''));
        const latest = Images[0];
        return {
            amiId: latest.ImageId!,
            name: latest.Name ?? '',
            description: latest.Description ?? '',
            creationDate: latest.CreationDate ?? '',
        };
    }
}
