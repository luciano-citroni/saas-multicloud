import { Injectable, Logger } from '@nestjs/common';

import * as ExcelJS from 'exceljs';

import * as path from 'path';

import * as fs from 'fs';

import * as os from 'os';

import { AssessmentData } from './aws-assessment-report.service';
import { safeJoinFilename } from '../../common/utils/safe-join-filename';

const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',

    pattern: 'solid',

    fgColor: { argb: 'FF232F3E' }, // AWS dark blue
};

const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

const ALT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };

@Injectable()
export class AwsAssessmentExcelService {
    private readonly logger = new Logger(AwsAssessmentExcelService.name);

    private readonly outputDir: string;

    constructor() {
        // Usar variável de ambiente ou calcular caminho robusto
        // Preferir tmp fora do repo: gravar em ./uploads com nest --watch (e OneDrive em Documents)
        // dispara "File change detected" e reinicia o backend no meio do sync.
        const envDir = process.env.EXCEL_UPLOADS_DIR?.trim();
        this.outputDir = envDir || path.join(os.tmpdir(), 'saas-multicloud', 'assessments');
        this.logger.debug(`Excel upload directory: ${this.outputDir}`);
    }

    private getCandidateDirs(): string[] {
        const projectRoot = this.getProjectRoot();
        return Array.from(
            new Set([
                this.outputDir,
                path.join(projectRoot, 'uploads', 'assessments'),
                path.join(projectRoot, 'backend', 'uploads', 'assessments'),
                path.join(os.tmpdir(), 'saas-multicloud', 'assessments'),
            ])
        );
    }

    private getProjectRoot(): string {
        let current = process.cwd();
        while (current !== path.dirname(current)) {
            if (fs.existsSync(path.join(current, 'package.json'))) {
                return current;
            }
            current = path.dirname(current);
        }
        return process.cwd();
    }

    private ensureOutputDir(): void {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    async generateExcel(jobId: string, data: AssessmentData): Promise<string> {
        const workbook = new ExcelJS.Workbook();

        workbook.creator = 'SaaS Multicloud';

        workbook.created = new Date();

        this.addSummarySheet(workbook, data);

        this.addVpcSheet(workbook, data);

        this.addSubnetSheet(workbook, data);

        this.addRouteTableSheet(workbook, data);

        this.addEc2Sheet(workbook, data);

        this.addSecurityGroupSheet(workbook, data);

        this.addEcsSheet(workbook, data);

        try {
            this.addEcsServicesSheet(workbook, data);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Não foi possível gerar a aba ECS Services: ${reason}`);
        }

        this.addEksSheet(workbook, data);

        this.addLoadBalancerSheet(workbook, data);

        this.addRdsSheet(workbook, data);

        this.addS3Sheet(workbook, data);

        this.addLambdaSheet(workbook, data);

        this.addApiGatewaySheet(workbook, data);

        this.addCloudFrontSheet(workbook, data);

        this.addRoute53Sheet(workbook, data);

        this.addDynamoDbSheet(workbook, data);

        this.addElastiCacheSheet(workbook, data);

        this.addSqsSheet(workbook, data);

        this.addSnsSheet(workbook, data);

        this.addKmsSheet(workbook, data);

        this.addSecretsManagerSheet(workbook, data);

        this.addEcrSheet(workbook, data);

        this.addWafSheet(workbook, data);

        this.addGuardDutySheet(workbook, data);

        this.addIamSheet(workbook, data);

        this.addCloudWatchSheet(workbook, data);

        this.addCloudTrailSheet(workbook, data);

        this.ensureOutputDir();

        const fileName = `assessment-${jobId}.xlsx`;

        const filePath = path.join(this.outputDir, fileName);

        await workbook.xlsx.writeFile(filePath);

        this.logger.log(`Excel gerado: ${filePath}`);

        return fileName;
    }

    getExcelFilePath(fileName: string): string {
        return safeJoinFilename(this.outputDir, fileName);
    }

    resolveExistingExcelFilePath(fileName: string): string | null {
        for (const dir of this.getCandidateDirs()) {
            const candidatePath = safeJoinFilename(dir, fileName);

            if (fs.existsSync(candidatePath)) {
                if (candidatePath !== this.getExcelFilePath(fileName)) {
                    this.logger.warn(`Excel AWS encontrado fora do diretório principal: ${candidatePath}`);
                }

                return candidatePath;
            }
        }

        return null;
    }

    async deleteExcel(fileName: string): Promise<void> {
        const paths = this.getCandidateDirs().map((dir) => safeJoinFilename(dir, fileName));

        await Promise.all(
            paths.map(async (filePath) => {
                try {
                    await fs.promises.unlink(filePath);
                    this.logger.log(`Excel removido: ${filePath}`);
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                        this.logger.warn(`Falha ao remover Excel ${filePath}: ${(error as Error).message}`);
                    }
                }
            }
            )
        );
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private styleHeader(sheet: ExcelJS.Worksheet): void {
        const headerRow = sheet.getRow(1);

        headerRow.eachCell((cell) => {
            cell.fill = HEADER_FILL;

            cell.font = HEADER_FONT;

            cell.alignment = { vertical: 'middle', horizontal: 'center' };

            cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
        });

        headerRow.height = 22;
    }

    private styleRows(sheet: ExcelJS.Worksheet): void {
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;

            if (rowNumber % 2 === 0) {
                row.eachCell((cell) => {
                    cell.fill = ALT_FILL;
                });
            }
        });
    }

    private autoFit(sheet: ExcelJS.Worksheet): void {
        sheet.columns.forEach((col) => {
            let maxLength = 10;

            col.eachCell?.({ includeEmpty: false }, (cell) => {
                const val = cell.value ? String(cell.value) : '';

                if (val.length > maxLength) maxLength = val.length;
            });

            col.width = Math.min(maxLength + 4, 60);
        });
    }

    private createSheet(workbook: ExcelJS.Workbook, name: string, columns: { header: string; key: string }[]): ExcelJS.Worksheet {
        const sheet = workbook.addWorksheet(name);

        sheet.columns = columns.map((c) => ({ ...c, width: 20 }));

        this.styleHeader(sheet);

        return sheet;
    }

    private finalize(sheet: ExcelJS.Worksheet): void {
        this.styleRows(sheet);

        this.autoFit(sheet);

        sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    private fmt(val: unknown): string {
        if (val === null || val === undefined) return '';

        if (typeof val === 'object') return JSON.stringify(val).substring(0, 200);

        return String(val);
    }

    private regionFromAvailabilityZone(availabilityZone: string | null | undefined): string {
        if (!availabilityZone) {
            return '';
        }

        // Ex.: us-east-1a -> us-east-1
        return availabilityZone.slice(0, -1);
    }

    private regionFromArn(arn: string | null | undefined): string {
        if (!arn) {
            return '';
        }

        const parts = arn.split(':');

        if (parts.length < 4) {
            return '';
        }

        return parts[3] ?? '';
    }

    private regionFromSqsUrl(queueUrl: string | null | undefined): string {
        if (!queueUrl) {
            return '';
        }

        try {
            const host = new URL(queueUrl).hostname;
            const match = host.match(/^sqs\.([a-z0-9-]+)\./i);

            return match?.[1] ?? '';
        } catch {
            return '';
        }
    }

    private buildVpcRegionMap(data: AssessmentData): Map<string, string> {
        const vpcRegionMap = new Map<string, string>();

        for (const subnet of data.subnets) {
            const region = this.regionFromAvailabilityZone(subnet.availabilityZone);

            if (region && !vpcRegionMap.has(subnet.awsVpcId)) {
                vpcRegionMap.set(subnet.awsVpcId, region);
            }
        }

        return vpcRegionMap;
    }

    // ─── Sheets ───────────────────────────────────────────────────────────────

    private addSummarySheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, '📊 Summary', [
            { header: 'Resource Type', key: 'type' },

            { header: 'Count', key: 'count' },
        ]);

        const rows = [
            { type: 'VPC', count: data.vpcs.length },

            { type: 'Subnet', count: data.subnets.length },

            { type: 'Route Table', count: data.routeTables.length },

            { type: 'EC2 Instance', count: data.ec2Instances.length },

            { type: 'Security Group', count: data.securityGroups.length },

            { type: 'ECS Cluster', count: data.ecsClusters.length },

            { type: 'ECS Task Definition', count: data.ecsTaskDefinitions.length },

            { type: 'ECS Service', count: data.ecsServices.length },

            { type: 'EKS Cluster', count: data.eksClusters.length },

            { type: 'Load Balancer', count: data.loadBalancers.length },

            { type: 'LB Listener', count: data.loadBalancerListeners.length },

            { type: 'RDS Instance', count: data.rdsInstances.length },

            { type: 'S3 Bucket', count: data.s3Buckets.length },

            { type: 'Lambda Function', count: data.lambdaFunctions.length },

            { type: 'API Gateway REST API', count: data.apiGatewayRestApis.length },

            { type: 'CloudFront Distribution', count: data.cloudFrontDistributions.length },

            { type: 'Route53 Hosted Zone', count: data.route53HostedZones.length },

            { type: 'DynamoDB Table', count: data.dynamoDbTables.length },

            { type: 'ElastiCache Cluster', count: data.elastiCacheClusters.length },

            { type: 'SQS Queue', count: data.sqsQueues.length },

            { type: 'SNS Topic', count: data.snsTopics.length },

            { type: 'KMS Key', count: data.kmsKeys.length },

            { type: 'Secrets Manager Secret', count: data.secretsManagerSecrets.length },

            { type: 'ECR Repository', count: data.ecrRepositories.length },

            { type: 'WAF Web ACL', count: data.wafWebAcls.length },

            { type: 'GuardDuty Detector', count: data.guardDutyDetectors.length },

            { type: 'IAM Role', count: data.iamRoles.length },

            { type: 'CloudWatch Alarm', count: data.cloudWatchAlarms.length },

            { type: 'CloudTrail Trail', count: data.cloudTrailTrails.length },
        ];

        const total = rows.reduce((s, r) => s + r.count, 0);

        rows.forEach((r) => sheet.addRow(r));

        const totalRow = sheet.addRow({ type: 'TOTAL', count: total });

        totalRow.font = { bold: true };

        this.finalize(sheet);
    }

    private addVpcSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const vpcRegionMap = this.buildVpcRegionMap(data);

        const sheet = this.createSheet(wb, 'VPC', [
            { header: 'AWS VPC ID', key: 'awsVpcId' },

            { header: 'Name (Tag)', key: 'name' },

            { header: 'CIDR Block', key: 'cidrBlock' },

            { header: 'Region', key: 'region' },

            { header: 'Is Default', key: 'isDefault' },

            { header: 'State', key: 'state' },

            { header: 'Last Synced', key: 'lastSyncedAt' },
        ]);

        data.vpcs.forEach((r) =>
            sheet.addRow({
                awsVpcId: r.awsVpcId,

                name: r.tags?.['Name'] ?? '',

                cidrBlock: r.cidrBlock,

                region: r.awsVpcId ? (vpcRegionMap.get(r.awsVpcId) ?? '') : '',

                isDefault: r.isDefault,

                state: r.state,

                lastSyncedAt: this.fmt(r.lastSyncedAt),
            })
        );

        this.finalize(sheet);
    }

    private addSubnetSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'Subnets', [
            { header: 'Subnet ID', key: 'awsSubnetId' },

            { header: 'Name (Tag)', key: 'name' },

            { header: 'VPC ID (AWS)', key: 'awsVpcId' },

            { header: 'CIDR Block', key: 'cidrBlock' },

            { header: 'Availability Zone', key: 'availabilityZone' },

            { header: 'Region', key: 'region' },

            { header: 'Subnet Type', key: 'subnetType' },

            { header: 'State', key: 'state' },
        ]);

        data.subnets.forEach((r) =>
            sheet.addRow({
                awsSubnetId: r.awsSubnetId,

                name: r.tags?.['Name'] ?? '',

                awsVpcId: r.awsVpcId,

                cidrBlock: r.cidrBlock,

                availabilityZone: r.availabilityZone,

                region: this.regionFromAvailabilityZone(r.availabilityZone),

                subnetType: r.subnetType,

                state: r.state,
            })
        );

        this.finalize(sheet);
    }

    private addRouteTableSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const vpcRegionMap = this.buildVpcRegionMap(data);

        const sheet = this.createSheet(wb, 'Route Tables', [
            { header: 'Route Table ID', key: 'awsRouteTableId' },

            { header: 'Name (Tag)', key: 'name' },

            { header: 'VPC ID (AWS)', key: 'awsVpcId' },

            { header: 'Region', key: 'region' },

            { header: 'Is Main', key: 'isMain' },

            { header: 'Routes Count', key: 'routesCount' },
        ]);

        data.routeTables.forEach((r) =>
            sheet.addRow({
                awsRouteTableId: r.awsRouteTableId,

                name: r.tags?.['Name'] ?? '',

                awsVpcId: r.awsVpcId,

                region: r.awsVpcId ? (vpcRegionMap.get(r.awsVpcId) ?? '') : '',

                isMain: r.isMain,

                routesCount: Array.isArray(r.routes) ? r.routes.length : 0,
            })
        );

        this.finalize(sheet);
    }

    private addEc2Sheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'EC2 Instances', [
            { header: 'Instance ID', key: 'awsInstanceId' },

            { header: 'Name (Tag)', key: 'name' },

            { header: 'Instance Type', key: 'instanceType' },

            { header: 'State', key: 'state' },

            { header: 'Region', key: 'region' },

            { header: 'VPC ID (AWS)', key: 'awsVpcId' },

            { header: 'Subnet ID (AWS)', key: 'awsSubnetId' },

            { header: 'Private IP', key: 'privateIpAddress' },

            { header: 'Public IP', key: 'publicIpAddress' },

            { header: 'AMI ID', key: 'imageId' },
        ]);

        data.ec2Instances.forEach((r) =>
            sheet.addRow({
                awsInstanceId: r.awsInstanceId,

                name: r.tags?.['Name'] ?? '',

                instanceType: r.instanceType,

                state: r.state,

                region: this.regionFromAvailabilityZone(r.availabilityZone),

                awsVpcId: r.awsVpcId,

                awsSubnetId: r.awsSubnetId,

                privateIpAddress: r.privateIpAddress,

                publicIpAddress: r.publicIpAddress,

                imageId: r.imageId,
            })
        );

        this.finalize(sheet);
    }

    private addSecurityGroupSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const vpcRegionMap = this.buildVpcRegionMap(data);

        const sheet = this.createSheet(wb, 'Security Groups', [
            { header: 'Group ID', key: 'awsSecurityGroupId' },

            { header: 'Name', key: 'name' },

            { header: 'VPC ID (AWS)', key: 'awsVpcId' },

            { header: 'Region', key: 'region' },

            { header: 'Description', key: 'description' },

            { header: 'Inbound Rules', key: 'inboundCount' },

            { header: 'Outbound Rules', key: 'outboundCount' },
        ]);

        data.securityGroups.forEach((r) =>
            sheet.addRow({
                awsSecurityGroupId: r.awsSecurityGroupId,

                name: r.name,

                awsVpcId: r.awsVpcId,

                region: r.awsVpcId ? (vpcRegionMap.get(r.awsVpcId) ?? '') : '',

                description: r.description,

                inboundCount: Array.isArray(r.inboundRules) ? r.inboundRules.length : 0,

                outboundCount: Array.isArray(r.outboundRules) ? r.outboundRules.length : 0,
            })
        );

        this.finalize(sheet);
    }

    private addEcsSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'ECS', [
            { header: 'Cluster Name', key: 'clusterName' },

            { header: 'Region', key: 'region' },

            { header: 'Status', key: 'status' },

            { header: 'Running Tasks', key: 'runningTasksCount' },

            { header: 'Active Services', key: 'activeServicesCount' },
        ]);

        data.ecsClusters.forEach((r) =>
            sheet.addRow({
                clusterName: r.clusterName,

                region: this.regionFromArn(r.clusterArn),

                status: r.status,

                runningTasksCount: r.runningTasksCount,

                activeServicesCount: r.activeServicesCount,
            })
        );

        this.finalize(sheet);
    }

    private addEcsServicesSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        // Create lookup maps for easier joins
        const taskDefMap = new Map(data.ecsTaskDefinitions.map((td) => [td.id, td]));
        const subnetByIdMap = new Map(data.subnets.map((s) => [s.id, s]));
        const subnetByAwsIdMap = new Map(data.subnets.map((s) => [s.awsSubnetId, s]));
        const sgByAwsIdMap = new Map(data.securityGroups.map((sg) => [sg.awsSecurityGroupId, sg]));
        const lbByNameMap = new Map(data.loadBalancers.map((lb) => [lb.name, lb]));
        const lbByArnMap = new Map(data.loadBalancers.map((lb) => [lb.awsLoadBalancerArn, lb]));

        const sheet = this.createSheet(wb, 'ECS Services', [
            { header: 'Service Name', key: 'serviceName' },
            { header: 'Cluster', key: 'clusterName' },
            { header: 'Status', key: 'status' },
            { header: 'Desired Count', key: 'desiredCount' },
            { header: 'Running Count', key: 'runningCount' },
            { header: 'Launch Type', key: 'launchType' },
            { header: 'vCPU', key: 'cpu' },
            { header: 'Memory (MB)', key: 'memory' },
            { header: 'Task Definition', key: 'taskDefinition' },
            { header: 'Task Def Revision', key: 'taskDefRevision' },
            { header: 'VPC', key: 'vpc' },
            { header: 'Subnets', key: 'subnets' },
            { header: 'Security Groups', key: 'securityGroups' },
            { header: 'Load Balancers', key: 'loadBalancers' },
            { header: 'Target Groups', key: 'targetGroups' },
        ]);

        data.ecsServices.forEach((service) => {
            const taskDef = taskDefMap.get(service.taskDefinitionId);
            const clusterName = data.ecsClusters.find((c) => c.id === service.clusterId)?.clusterName ?? '';

            // Extract network configuration
            const netConfig =
                service.networkConfiguration && typeof service.networkConfiguration === 'object'
                    ? (service.networkConfiguration as Record<string, unknown>)
                    : {};

            const awsvpcConfiguration =
                netConfig['awsvpcConfiguration'] && typeof netConfig['awsvpcConfiguration'] === 'object'
                    ? (netConfig['awsvpcConfiguration'] as Record<string, unknown>)
                    : {};

            const subnetIds = Array.isArray(awsvpcConfiguration['subnets'])
                ? awsvpcConfiguration['subnets'].filter((id): id is string => typeof id === 'string')
                : [];

            const sgIdsFromNetwork = Array.isArray(awsvpcConfiguration['securityGroups'])
                ? awsvpcConfiguration['securityGroups'].filter((id): id is string => typeof id === 'string')
                : [];

            const sgIdsFromService = Array.isArray(service.securityGroupIds)
                ? service.securityGroupIds.filter((id): id is string => typeof id === 'string')
                : [];

            const sgIds = sgIdsFromNetwork.length > 0 ? sgIdsFromNetwork : sgIdsFromService;

            const subnets = subnetIds
                .map((id: string) => {
                    const subnet = subnetByAwsIdMap.get(id) ?? subnetByIdMap.get(id);
                    return subnet ? `${subnet.tags?.['Name'] ?? subnet.awsSubnetId}` : id;
                })
                .join('; ');

            const securityGroups = sgIds
                .map((id: string) => {
                    const sg = sgByAwsIdMap.get(id);
                    return sg ? `${sg.name}` : id;
                })
                .join('; ');

            // Extract load balancers and target groups
            const lbsInfo = Array.isArray(service.loadBalancers)
                ? (service.loadBalancers as Array<Record<string, unknown>>)
                : [];

            const loadBalancers = lbsInfo
                .map((lb) => {
                    const lbName = typeof lb.loadBalancerName === 'string' ? lb.loadBalancerName : undefined;
                    const lbArn = typeof lb.loadBalancerArn === 'string' ? lb.loadBalancerArn : undefined;
                    const targetGroupArn = typeof lb.targetGroupArn === 'string' ? lb.targetGroupArn : undefined;

                    const dbLb = (lbArn ? lbByArnMap.get(lbArn) : undefined) ?? (lbName ? lbByNameMap.get(lbName) : undefined);

                    return dbLb?.name ?? lbName ?? targetGroupArn ?? 'N/A';
                })
                .join('; ');

            const targetGroups = lbsInfo
                .map((lb) => {
                    if (typeof lb.targetGroupArn === 'string') {
                        return lb.targetGroupArn;
                    }

                    if (typeof lb.targetGroupName === 'string') {
                        return lb.targetGroupName;
                    }

                    return 'N/A';
                })
                .join('; ');

            // Extract VPC from first subnet
            let vpcName = '';
            if (subnetIds.length > 0) {
                const firstSubnet = subnetByAwsIdMap.get(subnetIds[0]) ?? subnetByIdMap.get(subnetIds[0]);
                if (firstSubnet) {
                    const vpc = data.vpcs.find((v) => v.awsVpcId === firstSubnet.awsVpcId);
                    vpcName = vpc ? `${vpc.tags?.['Name'] ?? vpc.awsVpcId}` : '';
                }
            }

            sheet.addRow({
                serviceName: service.serviceName,
                clusterName,
                status: service.status,
                desiredCount: service.desiredCount,
                runningCount: service.runningCount,
                launchType: service.launchType ?? 'N/A',
                cpu: taskDef?.cpu ?? 'N/A',
                memory: taskDef?.memory ?? 'N/A',
                taskDefinition: taskDef?.family ?? 'N/A',
                taskDefRevision: taskDef?.revision ?? 'N/A',
                vpc: vpcName,
                subnets,
                securityGroups,
                loadBalancers,
                targetGroups,
            });
        });

        this.finalize(sheet);
    }

    private addEksSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'EKS', [
            { header: 'Cluster Name', key: 'clusterName' },

            { header: 'Region', key: 'region' },


            { header: 'Status', key: 'status' },

            { header: 'K8s Version', key: 'version' },

            { header: 'Endpoint', key: 'endpoint' },
        ]);

        data.eksClusters.forEach((r) =>
            sheet.addRow({
                clusterName: r.clusterName,

                region: this.regionFromArn(r.clusterArn),

                status: r.status,

                version: r.version,

                endpoint: r.endpoint,
            })
        );

        this.finalize(sheet);
    }

    private addLoadBalancerSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'Load Balancers', [
            { header: 'Name', key: 'name' },

            { header: 'Region', key: 'region' },

            { header: 'Type', key: 'type' },

            { header: 'Scheme', key: 'scheme' },

            { header: 'State', key: 'state' },

            { header: 'DNS Name', key: 'dnsName' },
        ]);

        data.loadBalancers.forEach((r) =>
            sheet.addRow({
                name: r.name,

                region: this.regionFromArn(r.awsLoadBalancerArn),

                type: r.type,

                scheme: r.scheme,

                state: r.state,

                dnsName: r.dnsName,
            })
        );

        this.finalize(sheet);
    }

    private addRdsSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'RDS', [
            { header: 'DB Identifier', key: 'awsDbInstanceIdentifier' },

            { header: 'Region', key: 'region' },

            { header: 'Engine', key: 'engine' },

            { header: 'Engine Version', key: 'engineVersion' },

            { header: 'Status', key: 'status' },

            { header: 'Instance Class', key: 'dbInstanceClass' },

            { header: 'Multi-AZ', key: 'multiAz' },
        ]);

        data.rdsInstances.forEach((r) =>
            sheet.addRow({
                awsDbInstanceIdentifier: r.awsDbInstanceIdentifier,

                region: this.regionFromAvailabilityZone(r.availabilityZone),

                engine: r.engine,

                engineVersion: r.engineVersion,

                status: r.status,

                dbInstanceClass: r.dbInstanceClass,

                multiAz: r.multiAz,
            })
        );

        this.finalize(sheet);
    }

    private addS3Sheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'S3 Buckets', [
            { header: 'Bucket Name', key: 'bucketName' },

            { header: 'Region', key: 'region' },

            { header: 'Versioning', key: 'versioningStatus' },

            { header: 'Encryption', key: 'encryptionEnabled' },

            { header: 'Public Access Blocked', key: 'publicAccessBlocked' },

            { header: 'Creation Date', key: 'creationDate' },
        ]);

        data.s3Buckets.forEach((r) =>
            sheet.addRow({
                bucketName: r.bucketName,

                region: r.region,

                versioningStatus: r.versioningStatus,

                encryptionEnabled: r.encryptionEnabled,

                publicAccessBlocked: r.publicAccessBlocked,

                creationDate: this.fmt(r.creationDate),
            })
        );

        this.finalize(sheet);
    }

    private addLambdaSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'Lambda', [
            { header: 'Function Name', key: 'functionName' },

            { header: 'Region', key: 'region' },

            { header: 'Runtime', key: 'runtime' },

            { header: 'State', key: 'state' },

            { header: 'Memory (MB)', key: 'memorySize' },

            { header: 'Timeout (s)', key: 'timeout' },

            { header: 'VPC ID (AWS)', key: 'awsVpcId' },
        ]);

        data.lambdaFunctions.forEach((r) =>
            sheet.addRow({
                functionName: r.functionName,

                region: this.regionFromArn(r.functionArn),

                runtime: r.runtime,

                state: r.state,

                memorySize: r.memorySize,

                timeout: r.timeout,

                awsVpcId: r.awsVpcId,
            })
        );

        this.finalize(sheet);
    }

    private addApiGatewaySheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const vpcRegionMap = this.buildVpcRegionMap(data);

        const sheet = this.createSheet(wb, 'API Gateway', [
            { header: 'API Name', key: 'name' },

            { header: 'API ID', key: 'awsApiId' },

            { header: 'Endpoint Type', key: 'endpointType' },

            { header: 'Region', key: 'region' },

            { header: 'Description', key: 'description' },

            { header: 'Created', key: 'createdAtAws' },
        ]);

        data.apiGatewayRestApis.forEach((r) =>
            sheet.addRow({
                name: r.name,

                awsApiId: r.awsApiId,

                endpointType: r.endpointType,

                region: r.awsVpcId ? (vpcRegionMap.get(r.awsVpcId) ?? '') : '',

                description: r.description,

                createdAtAws: this.fmt(r.createdAtAws),
            })
        );

        this.finalize(sheet);
    }

    private addCloudFrontSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'CloudFront', [
            { header: 'Distribution ID', key: 'distributionId' },

            { header: 'Region', key: 'region' },

            { header: 'Domain Name', key: 'domainName' },

            { header: 'Status', key: 'status' },

            { header: 'Price Class', key: 'priceClass' },

            { header: 'Enabled', key: 'enabled' },
        ]);

        data.cloudFrontDistributions.forEach((r) =>
            sheet.addRow({
                distributionId: r.distributionId,

                region: 'global',

                domainName: r.domainName,

                status: r.status,

                priceClass: r.priceClass,

                enabled: r.enabled,
            })
        );

        this.finalize(sheet);
    }

    private addRoute53Sheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'Route53', [
            { header: 'Hosted Zone ID', key: 'awsHostedZoneId' },

            { header: 'Region', key: 'region' },

            { header: 'Name', key: 'name' },

            { header: 'Zone Type', key: 'zoneType' },

            { header: 'Is Private', key: 'isPrivate' },

            { header: 'Record Count', key: 'recordSetCount' },
        ]);

        data.route53HostedZones.forEach((r) =>
            sheet.addRow({
                awsHostedZoneId: r.awsHostedZoneId,

                region: 'global',

                name: r.name,

                zoneType: r.zoneType,

                isPrivate: r.isPrivate,

                recordSetCount: r.recordSetCount,
            })
        );

        this.finalize(sheet);
    }

    private addDynamoDbSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'DynamoDB', [
            { header: 'Table Name', key: 'tableName' },

            { header: 'Region', key: 'region' },

            { header: 'Status', key: 'tableStatus' },

            { header: 'Billing Mode', key: 'billingMode' },

            { header: 'Item Count', key: 'itemCount' },
        ]);

        data.dynamoDbTables.forEach((r) =>
            sheet.addRow({
                tableName: r.tableName,

                region: this.regionFromArn(r.tableArn),

                tableStatus: r.tableStatus,

                billingMode: r.billingMode,

                itemCount: r.itemCount,
            })
        );

        this.finalize(sheet);
    }

    private addElastiCacheSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'ElastiCache', [
            { header: 'Cluster ID', key: 'cacheClusterId' },

            { header: 'Region', key: 'region' },

            { header: 'Engine', key: 'engine' },

            { header: 'Engine Version', key: 'engineVersion' },

            { header: 'Status', key: 'cacheClusterStatus' },

            { header: 'Node Type', key: 'cacheNodeType' },

            { header: 'Num Nodes', key: 'numCacheNodes' },
        ]);

        data.elastiCacheClusters.forEach((r) =>
            sheet.addRow({
                cacheClusterId: r.cacheClusterId,

                region: this.regionFromArn(r.clusterArn),

                engine: r.engine,

                engineVersion: r.engineVersion,

                cacheClusterStatus: r.cacheClusterStatus,

                cacheNodeType: r.cacheNodeType,

                numCacheNodes: r.numCacheNodes,
            })
        );

        this.finalize(sheet);
    }

    private addSqsSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'SQS', [
            { header: 'Queue Name', key: 'queueName' },

            { header: 'Region', key: 'region' },

            { header: 'Queue URL', key: 'queueUrl' },

            { header: 'Is FIFO', key: 'isFifo' },

            { header: 'Visibility Timeout', key: 'visibilityTimeout' },
        ]);

        data.sqsQueues.forEach((r) =>
            sheet.addRow({
                queueName: r.queueName,

                region: this.regionFromArn(r.queueArn) || this.regionFromSqsUrl(r.queueUrl),

                queueUrl: r.queueUrl,

                isFifo: r.isFifo,

                visibilityTimeout: r.visibilityTimeout,
            })
        );

        this.finalize(sheet);
    }

    private addSnsSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'SNS', [
            { header: 'Topic Name', key: 'topicName' },

            { header: 'Region', key: 'region' },

            { header: 'Topic ARN', key: 'topicArn' },

            { header: 'Subscriptions Confirmed', key: 'subscriptionsConfirmed' },
        ]);

        data.snsTopics.forEach((r) =>
            sheet.addRow({
                topicName: r.topicName,

                region: this.regionFromArn(r.topicArn),

                topicArn: r.topicArn,

                subscriptionsConfirmed: r.subscriptionsConfirmed,
            })
        );

        this.finalize(sheet);
    }

    private addKmsSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'KMS', [
            { header: 'Key ID', key: 'awsKeyId' },

            { header: 'Region', key: 'region' },

            { header: 'Key ARN', key: 'keyArn' },

            { header: 'State', key: 'keyState' },

            { header: 'Usage', key: 'keyUsage' },

            { header: 'Manager', key: 'keyManager' },

            { header: 'Description', key: 'description' },
        ]);

        data.kmsKeys.forEach((r) =>
            sheet.addRow({
                awsKeyId: r.awsKeyId,

                region: this.regionFromArn(r.keyArn),

                keyArn: r.keyArn,

                keyState: r.keyState,

                keyUsage: r.keyUsage,

                keyManager: r.keyManager,

                description: r.description,
            })
        );

        this.finalize(sheet);
    }

    private addSecretsManagerSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'Secrets Manager', [
            { header: 'Name', key: 'name' },

            { header: 'Region', key: 'region' },

            { header: 'ARN', key: 'secretArn' },

            { header: 'Last Rotated', key: 'lastRotatedDate' },

            { header: 'Rotation Enabled', key: 'rotationEnabled' },
        ]);

        data.secretsManagerSecrets.forEach((r) =>
            sheet.addRow({
                name: r.name,

                region: this.regionFromArn(r.secretArn),

                secretArn: r.secretArn,

                lastRotatedDate: this.fmt(r.lastRotatedDate),

                rotationEnabled: r.rotationEnabled,
            })
        );

        this.finalize(sheet);
    }

    private addEcrSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'ECR', [
            { header: 'Repository Name', key: 'repositoryName' },

            { header: 'Region', key: 'region' },

            { header: 'Repository ARN', key: 'repositoryArn' },

            { header: 'Repository URI', key: 'repositoryUri' },

            { header: 'Scan On Push', key: 'scanOnPush' },

            { header: 'Tag Mutability', key: 'imageTagMutability' },
        ]);

        data.ecrRepositories.forEach((r) =>
            sheet.addRow({
                repositoryName: r.repositoryName,

                region: this.regionFromArn(r.repositoryArn),

                repositoryArn: r.repositoryArn,

                repositoryUri: r.repositoryUri,

                scanOnPush: r.scanOnPush,

                imageTagMutability: r.imageTagMutability,
            })
        );

        this.finalize(sheet);
    }

    private addWafSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'WAF', [
            { header: 'Name', key: 'name' },

            { header: 'Region', key: 'region' },

            { header: 'ARN', key: 'webAclArn' },

            { header: 'Scope', key: 'scope' },

            { header: 'Rules Count', key: 'rulesCount' },
        ]);

        data.wafWebAcls.forEach((r) =>
            sheet.addRow({
                name: r.name,

                region: r.scope === 'CLOUDFRONT' ? 'global' : this.regionFromArn(r.webAclArn),

                webAclArn: r.webAclArn,

                scope: r.scope,

                rulesCount: r.rulesCount ?? 0,
            })
        );

        this.finalize(sheet);
    }

    private addGuardDutySheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'GuardDuty', [
            { header: 'Detector ID', key: 'detectorId' },

            { header: 'Region', key: 'region' },

            { header: 'Status', key: 'status' },

            { header: 'Finding Publishing Frequency', key: 'findingPublishingFrequency' },

            { header: 'Service Role ARN', key: 'serviceRole' },
        ]);

        data.guardDutyDetectors.forEach((r) =>
            sheet.addRow({
                detectorId: r.detectorId,

                region: '',

                status: r.status,

                findingPublishingFrequency: r.findingPublishingFrequency,

                serviceRole: r.serviceRole,
            })
        );

        this.finalize(sheet);
    }

    private addIamSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'IAM Roles', [
            { header: 'Role Name', key: 'roleName' },

            { header: 'Region', key: 'region' },

            { header: 'Role ARN', key: 'roleArn' },

            { header: 'Path', key: 'path' },

            { header: 'Created (AWS)', key: 'createdDateAws' },

            { header: 'Description', key: 'description' },
        ]);

        data.iamRoles.forEach((r) =>
            sheet.addRow({
                roleName: r.roleName,

                region: 'global',

                roleArn: r.roleArn,

                path: r.path,

                createdDateAws: this.fmt(r.createdDateAws),

                description: r.description,
            })
        );

        this.finalize(sheet);
    }

    private addCloudWatchSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'CloudWatch Alarms', [
            { header: 'Alarm Name', key: 'alarmName' },

            { header: 'Region', key: 'region' },

            { header: 'State', key: 'stateValue' },

            { header: 'Metric Name', key: 'metricName' },

            { header: 'Namespace', key: 'namespace' },

            { header: 'Threshold', key: 'threshold' },
        ]);

        data.cloudWatchAlarms.forEach((r) =>
            sheet.addRow({
                alarmName: r.alarmName,

                region: this.regionFromArn(r.alarmArn),

                stateValue: r.stateValue,

                metricName: r.metricName,

                namespace: r.namespace,

                threshold: r.threshold,
            })
        );

        this.finalize(sheet);
    }

    private addCloudTrailSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'CloudTrail', [
            { header: 'Trail Name', key: 'name' },

            { header: 'Region', key: 'region' },

            { header: 'Trail ARN', key: 'trailArn' },

            { header: 'S3 Bucket', key: 's3BucketName' },

            { header: 'Multi Region', key: 'isMultiRegionTrail' },

            { header: 'Logging', key: 'isLogging' },
        ]);

        data.cloudTrailTrails.forEach((r) =>
            sheet.addRow({
                name: r.name,

                region: r.homeRegion ?? '',

                trailArn: r.trailArn,

                s3BucketName: r.s3BucketName,

                isMultiRegionTrail: r.isMultiRegionTrail,

                isLogging: r.isLogging,
            })
        );

        this.finalize(sheet);
    }
}
