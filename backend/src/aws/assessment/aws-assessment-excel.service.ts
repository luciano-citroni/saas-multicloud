import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AssessmentData } from './aws-assessment-report.service';

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
    private readonly outputDir = path.join(os.tmpdir(), 'saas-multicloud', 'assessments');

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

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        const fileName = `assessment-${jobId}.xlsx`;
        const filePath = path.join(this.outputDir, fileName);
        await workbook.xlsx.writeFile(filePath);
        this.logger.log(`Excel gerado: ${filePath}`);
        return fileName;
    }

    getExcelFilePath(fileName: string): string {
        return path.join(this.outputDir, fileName);
    }

    async deleteExcel(fileName: string): Promise<void> {
        const filePath = this.getExcelFilePath(fileName);
        try {
            await fs.promises.unlink(filePath);
            this.logger.log(`Excel removido: ${filePath}`);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                this.logger.warn(`Falha ao remover Excel ${filePath}: ${(error as Error).message}`);
            }
        }
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
        const sheet = this.createSheet(wb, 'VPC', [
            { header: 'AWS VPC ID', key: 'awsVpcId' },
            { header: 'Name (Tag)', key: 'name' },
            { header: 'CIDR Block', key: 'cidrBlock' },
            { header: 'Is Default', key: 'isDefault' },
            { header: 'State', key: 'state' },
            { header: 'Last Synced', key: 'lastSyncedAt' },
        ]);
        data.vpcs.forEach((r) =>
            sheet.addRow({
                awsVpcId: r.awsVpcId,
                name: r.tags?.['Name'] ?? '',
                cidrBlock: r.cidrBlock,
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
                subnetType: r.subnetType,
                state: r.state,
            })
        );
        this.finalize(sheet);
    }

    private addRouteTableSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'Route Tables', [
            { header: 'Route Table ID', key: 'awsRouteTableId' },
            { header: 'Name (Tag)', key: 'name' },
            { header: 'VPC ID (AWS)', key: 'awsVpcId' },
            { header: 'Is Main', key: 'isMain' },
            { header: 'Routes Count', key: 'routesCount' },
        ]);
        data.routeTables.forEach((r) =>
            sheet.addRow({
                awsRouteTableId: r.awsRouteTableId,
                name: r.tags?.['Name'] ?? '',
                awsVpcId: r.awsVpcId,
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
        const sheet = this.createSheet(wb, 'Security Groups', [
            { header: 'Group ID', key: 'awsSecurityGroupId' },
            { header: 'Name', key: 'name' },
            { header: 'VPC ID (AWS)', key: 'awsVpcId' },
            { header: 'Description', key: 'description' },
            { header: 'Inbound Rules', key: 'inboundCount' },
            { header: 'Outbound Rules', key: 'outboundCount' },
        ]);
        data.securityGroups.forEach((r) =>
            sheet.addRow({
                awsSecurityGroupId: r.awsSecurityGroupId,
                name: r.name,
                awsVpcId: r.awsVpcId,
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
            { header: 'Status', key: 'status' },
            { header: 'Running Tasks', key: 'runningTasksCount' },
            { header: 'Active Services', key: 'activeServicesCount' },
        ]);
        data.ecsClusters.forEach((r) =>
            sheet.addRow({
                clusterName: r.clusterName,
                status: r.status,
                runningTasksCount: r.runningTasksCount,
                activeServicesCount: r.activeServicesCount,
            })
        );
        this.finalize(sheet);
    }

    private addEksSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'EKS', [
            { header: 'Cluster Name', key: 'clusterName' },
            { header: 'Status', key: 'status' },
            { header: 'K8s Version', key: 'version' },
            { header: 'Endpoint', key: 'endpoint' },
        ]);
        data.eksClusters.forEach((r) =>
            sheet.addRow({
                clusterName: r.clusterName,
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
            { header: 'Type', key: 'type' },
            { header: 'Scheme', key: 'scheme' },
            { header: 'State', key: 'state' },
            { header: 'DNS Name', key: 'dnsName' },
        ]);
        data.loadBalancers.forEach((r) =>
            sheet.addRow({
                name: r.name,
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
            { header: 'Engine', key: 'engine' },
            { header: 'Engine Version', key: 'engineVersion' },
            { header: 'Status', key: 'status' },
            { header: 'Instance Class', key: 'dbInstanceClass' },
            { header: 'Multi-AZ', key: 'multiAz' },
        ]);
        data.rdsInstances.forEach((r) =>
            sheet.addRow({
                awsDbInstanceIdentifier: r.awsDbInstanceIdentifier,
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
            { header: 'Runtime', key: 'runtime' },
            { header: 'State', key: 'state' },
            { header: 'Memory (MB)', key: 'memorySize' },
            { header: 'Timeout (s)', key: 'timeout' },
            { header: 'VPC ID (AWS)', key: 'awsVpcId' },
        ]);
        data.lambdaFunctions.forEach((r) =>
            sheet.addRow({
                functionName: r.functionName,
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
        const sheet = this.createSheet(wb, 'API Gateway', [
            { header: 'API Name', key: 'name' },
            { header: 'API ID', key: 'awsApiId' },
            { header: 'Endpoint Type', key: 'endpointType' },
            { header: 'Description', key: 'description' },
            { header: 'Created', key: 'createdAtAws' },
        ]);
        data.apiGatewayRestApis.forEach((r) =>
            sheet.addRow({
                name: r.name,
                awsApiId: r.awsApiId,
                endpointType: r.endpointType,
                description: r.description,
                createdAtAws: this.fmt(r.createdAtAws),
            })
        );
        this.finalize(sheet);
    }

    private addCloudFrontSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'CloudFront', [
            { header: 'Distribution ID', key: 'distributionId' },
            { header: 'Domain Name', key: 'domainName' },
            { header: 'Status', key: 'status' },
            { header: 'Price Class', key: 'priceClass' },
            { header: 'Enabled', key: 'enabled' },
        ]);
        data.cloudFrontDistributions.forEach((r) =>
            sheet.addRow({
                distributionId: r.distributionId,
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
            { header: 'Name', key: 'name' },
            { header: 'Zone Type', key: 'zoneType' },
            { header: 'Is Private', key: 'isPrivate' },
            { header: 'Record Count', key: 'recordSetCount' },
        ]);
        data.route53HostedZones.forEach((r) =>
            sheet.addRow({
                awsHostedZoneId: r.awsHostedZoneId,
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
            { header: 'Status', key: 'tableStatus' },
            { header: 'Billing Mode', key: 'billingMode' },
            { header: 'Item Count', key: 'itemCount' },
        ]);
        data.dynamoDbTables.forEach((r) =>
            sheet.addRow({
                tableName: r.tableName,
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
            { header: 'Engine', key: 'engine' },
            { header: 'Engine Version', key: 'engineVersion' },
            { header: 'Status', key: 'cacheClusterStatus' },
            { header: 'Node Type', key: 'cacheNodeType' },
            { header: 'Num Nodes', key: 'numCacheNodes' },
        ]);
        data.elastiCacheClusters.forEach((r) =>
            sheet.addRow({
                cacheClusterId: r.cacheClusterId,
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
            { header: 'Queue URL', key: 'queueUrl' },
            { header: 'Is FIFO', key: 'isFifo' },
            { header: 'Visibility Timeout', key: 'visibilityTimeout' },
        ]);
        data.sqsQueues.forEach((r) =>
            sheet.addRow({
                queueName: r.queueName,
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
            { header: 'Topic ARN', key: 'topicArn' },
            { header: 'Subscriptions Confirmed', key: 'subscriptionsConfirmed' },
        ]);
        data.snsTopics.forEach((r) =>
            sheet.addRow({
                topicName: r.topicName,
                topicArn: r.topicArn,
                subscriptionsConfirmed: r.subscriptionsConfirmed,
            })
        );
        this.finalize(sheet);
    }

    private addKmsSheet(wb: ExcelJS.Workbook, data: AssessmentData): void {
        const sheet = this.createSheet(wb, 'KMS', [
            { header: 'Key ID', key: 'awsKeyId' },
            { header: 'Key ARN', key: 'keyArn' },
            { header: 'State', key: 'keyState' },
            { header: 'Usage', key: 'keyUsage' },
            { header: 'Manager', key: 'keyManager' },
            { header: 'Description', key: 'description' },
        ]);
        data.kmsKeys.forEach((r) =>
            sheet.addRow({
                awsKeyId: r.awsKeyId,
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
            { header: 'ARN', key: 'secretArn' },
            { header: 'Last Rotated', key: 'lastRotatedDate' },
            { header: 'Rotation Enabled', key: 'rotationEnabled' },
        ]);
        data.secretsManagerSecrets.forEach((r) =>
            sheet.addRow({
                name: r.name,
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
            { header: 'Repository ARN', key: 'repositoryArn' },
            { header: 'Repository URI', key: 'repositoryUri' },
            { header: 'Scan On Push', key: 'scanOnPush' },
            { header: 'Tag Mutability', key: 'imageTagMutability' },
        ]);
        data.ecrRepositories.forEach((r) =>
            sheet.addRow({
                repositoryName: r.repositoryName,
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
            { header: 'ARN', key: 'webAclArn' },
            { header: 'Scope', key: 'scope' },
            { header: 'Rules Count', key: 'rulesCount' },
        ]);
        data.wafWebAcls.forEach((r) =>
            sheet.addRow({
                name: r.name,
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
            { header: 'Status', key: 'status' },
            { header: 'Finding Publishing Frequency', key: 'findingPublishingFrequency' },
            { header: 'Service Role ARN', key: 'serviceRole' },
        ]);
        data.guardDutyDetectors.forEach((r) =>
            sheet.addRow({
                detectorId: r.detectorId,
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
            { header: 'Role ARN', key: 'roleArn' },
            { header: 'Path', key: 'path' },
            { header: 'Created (AWS)', key: 'createdDateAws' },
            { header: 'Description', key: 'description' },
        ]);
        data.iamRoles.forEach((r) =>
            sheet.addRow({
                roleName: r.roleName,
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
            { header: 'State', key: 'stateValue' },
            { header: 'Metric Name', key: 'metricName' },
            { header: 'Namespace', key: 'namespace' },
            { header: 'Threshold', key: 'threshold' },
        ]);
        data.cloudWatchAlarms.forEach((r) =>
            sheet.addRow({
                alarmName: r.alarmName,
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
            { header: 'Trail ARN', key: 'trailArn' },
            { header: 'S3 Bucket', key: 's3BucketName' },
            { header: 'Multi Region', key: 'isMultiRegionTrail' },
            { header: 'Logging', key: 'isLogging' },
        ]);
        data.cloudTrailTrails.forEach((r) =>
            sheet.addRow({
                name: r.name,
                trailArn: r.trailArn,
                s3BucketName: r.s3BucketName,
                isMultiRegionTrail: r.isMultiRegionTrail,
                isLogging: r.isLogging,
            })
        );
        this.finalize(sheet);
    }
}
