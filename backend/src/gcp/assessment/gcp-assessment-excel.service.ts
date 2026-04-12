import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

import type { GcpAssessmentData } from './gcp-assessment-report.service';

// GCP blue
const GCP_HEADER_BG = 'FF4285F4';
const GCP_HEADER_FG = 'FFFFFFFF';
const ROW_ALT_BG = 'FFF8FBFF';

@Injectable()
export class GcpAssessmentExcelService {
    private readonly logger = new Logger(GcpAssessmentExcelService.name);

    private getOutputDir(): string {
        const dir = path.join(process.cwd(), 'uploads', 'assessments');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    getExcelFilePath(fileName: string): string {
        return path.join(this.getOutputDir(), fileName);
    }

    async deleteExcel(fileName: string): Promise<void> {
        const filePath = this.getExcelFilePath(fileName);
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (err) {
            this.logger.warn(`Falha ao deletar arquivo Excel GCP: ${(err as Error).message}`);
        }
    }

    async generateExcel(jobId: string, data: GcpAssessmentData): Promise<string> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SaaS MultiCloud';
        workbook.created = new Date();

        this.addSummarySheet(workbook, data);
        this.addVmInstancesSheet(workbook, data.vmInstances);
        this.addVpcNetworksSheet(workbook, data.vpcNetworks);
        this.addSubnetworksSheet(workbook, data.subnetworks);
        this.addFirewallRulesSheet(workbook, data.firewallRules);
        this.addStorageBucketsSheet(workbook, data.storageBuckets);
        this.addSqlInstancesSheet(workbook, data.sqlInstances);
        this.addServiceAccountsSheet(workbook, data.serviceAccounts);
        this.addGkeClustersSheet(workbook, data.gkeClusters);
        this.addCdnBackendServicesSheet(workbook, data.cdnBackendServices);
        this.addCloudRunServicesSheet(workbook, data.cloudRunServices);
        this.addCloudRunJobsSheet(workbook, data.cloudRunJobs);

        const fileName = `gcp-assessment-${jobId}.xlsx`;
        const filePath = this.getExcelFilePath(fileName);
        await workbook.xlsx.writeFile(filePath);

        this.logger.log(`Excel GCP gerado: ${filePath}`);
        return fileName;
    }

    private styleHeader(row: ExcelJS.Row): void {
        row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GCP_HEADER_BG } };
            cell.font = { bold: true, color: { argb: GCP_HEADER_FG }, size: 11 };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FF3367D6' } } };
        });
        row.height = 22;
    }

    private styleDataRow(row: ExcelJS.Row, index: number): void {
        if (index % 2 === 0) {
            row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT_BG } };
            });
        }
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', wrapText: false };
        });
    }

    private autoFit(sheet: ExcelJS.Worksheet): void {
        sheet.columns.forEach((col) => {
            let maxLen = 10;
            col.eachCell?.({ includeEmpty: false }, (cell) => {
                const len = String(cell.value ?? '').length;
                if (len > maxLen) maxLen = len;
            });
            col.width = Math.min(maxLen + 2, 60);
        });
    }

    private addSummarySheet(workbook: ExcelJS.Workbook, data: GcpAssessmentData): void {
        const sheet = workbook.addWorksheet('Resumo');
        sheet.addRow(['Tipo de Recurso', 'Quantidade']);
        this.styleHeader(sheet.getRow(1));

        const rows = [
            ['VM Instances', data.vmInstances.length],
            ['VPC Networks', data.vpcNetworks.length],
            ['Subnetworks', data.subnetworks.length],
            ['Firewall Rules', data.firewallRules.length],
            ['Storage Buckets', data.storageBuckets.length],
            ['Cloud SQL Instances', data.sqlInstances.length],
            ['Service Accounts', data.serviceAccounts.length],
            ['GKE Clusters', data.gkeClusters.length],
            ['CDN Backend Services', data.cdnBackendServices.length],
            ['Cloud Run Services', data.cloudRunServices.length],
            ['Cloud Run Jobs', data.cloudRunJobs.length],
        ];

        rows.forEach((r, i) => {
            const row = sheet.addRow(r);
            this.styleDataRow(row, i);
        });

        const total = rows.reduce((s, r) => s + (r[1] as number), 0);
        const totalRow = sheet.addRow(['TOTAL', total]);
        totalRow.font = { bold: true };
        totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };

        this.autoFit(sheet);
    }

    private addVmInstancesSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['vmInstances']): void {
        const sheet = workbook.addWorksheet('VM Instances');
        sheet.addRow(['ID', 'Nome', 'Zona', 'Machine Type', 'Status', 'IP Interno', 'IP Externo', 'Delettion Protection', 'SA Email', 'Criado em']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([
                item.gcpInstanceId,
                item.name,
                item.zone,
                item.machineType,
                item.status,
                item.networkIp ?? '',
                item.externalIp ?? '',
                item.deletionProtection ? 'Sim' : 'Não',
                item.serviceAccountEmail ?? '',
                item.creationTimestamp?.toISOString() ?? '',
            ]);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }

    private addVpcNetworksSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['vpcNetworks']): void {
        const sheet = workbook.addWorksheet('VPC Networks');
        sheet.addRow(['ID', 'Nome', 'Descrição', 'Routing Mode', 'Auto Subnets', 'Criado em']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([
                item.gcpNetworkId,
                item.name,
                item.description ?? '',
                item.routingMode ?? '',
                item.autoCreateSubnetworks ? 'Sim' : 'Não',
                item.creationTimestamp?.toISOString() ?? '',
            ]);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }

    private addSubnetworksSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['subnetworks']): void {
        const sheet = workbook.addWorksheet('Subnetworks');
        sheet.addRow(['ID', 'Nome', 'Região', 'CIDR', 'Rede VPC', 'Private Google Access', 'Purpose', 'Criado em']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([
                item.gcpSubnetworkId,
                item.name,
                item.region,
                item.ipCidrRange,
                item.networkName ?? '',
                item.privateIpGoogleAccess ? 'Sim' : 'Não',
                item.purpose ?? '',
                item.creationTimestamp?.toISOString() ?? '',
            ]);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }

    private addFirewallRulesSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['firewallRules']): void {
        const sheet = workbook.addWorksheet('Firewall Rules');
        sheet.addRow(['ID', 'Nome', 'Rede', 'Direção', 'Prioridade', 'Source Ranges', 'Allowed', 'Disabled', 'Criado em']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([
                item.gcpFirewallId,
                item.name,
                item.networkName ?? '',
                item.direction,
                item.priority,
                JSON.stringify(item.sourceRanges ?? []),
                JSON.stringify(item.allowed ?? item.denied ?? []),
                item.disabled ? 'Sim' : 'Não',
                item.creationTimestamp?.toISOString() ?? '',
            ]);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }

    private addStorageBucketsSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['storageBuckets']): void {
        const sheet = workbook.addWorksheet('Storage Buckets');
        sheet.addRow(['ID', 'Nome', 'Localização', 'Tipo Localização', 'Storage Class', 'Versionamento', 'Acesso Público', 'Uniform Access', 'Criado em']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([
                item.gcpBucketId,
                item.name,
                item.location,
                item.locationType ?? '',
                item.storageClass,
                item.versioningEnabled ? 'Sim' : 'Não',
                item.publicAccessPrevention ?? '',
                item.uniformBucketLevelAccess ? 'Sim' : 'Não',
                item.timeCreated?.toISOString() ?? '',
            ]);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }

    private addSqlInstancesSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['sqlInstances']): void {
        const sheet = workbook.addWorksheet('Cloud SQL');
        sheet.addRow(['ID', 'Nome', 'Database Version', 'Região', 'Status', 'Tier', 'Disk Type', 'Disk GB', 'Backup', 'HA', 'Criado em']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([
                item.gcpInstanceId,
                item.name,
                item.databaseVersion,
                item.region,
                item.state,
                item.tier ?? '',
                item.diskType ?? '',
                item.diskSizeGb ?? '',
                item.backupEnabled ? 'Sim' : 'Não',
                item.availabilityType ?? '',
                item.createTime?.toISOString() ?? '',
            ]);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }

    private addServiceAccountsSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['serviceAccounts']): void {
        const sheet = workbook.addWorksheet('Service Accounts');
        sheet.addRow(['Email', 'Display Name', 'Descrição', 'Desabilitada', 'Unique ID']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([item.email, item.displayName ?? '', item.description ?? '', item.disabled ? 'Sim' : 'Não', item.gcpUniqueId ?? '']);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }

    private addGkeClustersSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['gkeClusters']): void {
        const sheet = workbook.addWorksheet('GKE Clusters');
        sheet.addRow(['ID', 'Nome', 'Localização', 'Status', 'Nodes', 'Master Version', 'Endpoint', 'Rede', 'Criado em']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([
                item.gcpClusterId,
                item.name,
                item.location,
                item.status,
                item.nodeCount ?? '',
                item.currentMasterVersion ?? '',
                item.endpoint ?? '',
                item.networkName ?? '',
                item.createTime?.toISOString() ?? '',
            ]);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }

    private addCdnBackendServicesSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['cdnBackendServices']): void {
        const sheet = workbook.addWorksheet('CDN Backend Services');
        sheet.addRow(['ID', 'Nome', 'Região', 'Protocolo', 'LB Scheme', 'CDN Habilitado', 'Cache Mode', 'Default TTL (s)', 'Max TTL (s)', 'Sync em']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([
                item.gcpBackendServiceId,
                item.name,
                item.region,
                item.protocol ?? '',
                item.loadBalancingScheme ?? '',
                item.cdnEnabled ? 'Sim' : 'Não',
                item.cacheMode ?? '',
                item.defaultTtlSeconds ?? '',
                item.maxTtlSeconds ?? '',
                item.lastSyncedAt?.toISOString() ?? '',
            ]);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }

    private addCloudRunServicesSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['cloudRunServices']): void {
        const sheet = workbook.addWorksheet('Cloud Run Services');
        sheet.addRow(['Nome', 'Região', 'Status', 'URI', 'Público', 'Imagem', 'Min Inst', 'Max Inst', 'CPU', 'Memória', 'VPC Connector', 'Criado em']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([
                item.name,
                item.region,
                item.condition ?? '',
                item.uri ?? '',
                item.allowsUnauthenticated ? 'Sim' : 'Não',
                item.containerImage ?? '',
                item.minInstanceCount ?? '',
                item.maxInstanceCount ?? '',
                item.cpuLimit ?? '',
                item.memoryLimit ?? '',
                item.vpcConnector ?? '',
                item.createTime?.toISOString() ?? '',
            ]);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }

    private addCloudRunJobsSheet(workbook: ExcelJS.Workbook, items: GcpAssessmentData['cloudRunJobs']): void {
        const sheet = workbook.addWorksheet('Cloud Run Jobs');
        sheet.addRow(['Nome', 'Região', 'Status', 'Imagem', 'Tasks', 'Max Retries', 'Execuções', 'Última Execução', 'CPU', 'Memória', 'Criado em']);
        this.styleHeader(sheet.getRow(1));
        items.forEach((item, i) => {
            const row = sheet.addRow([
                item.name,
                item.region,
                item.condition ?? '',
                item.containerImage ?? '',
                item.taskCount ?? '',
                item.maxRetries ?? '',
                item.executionCount ?? '',
                item.latestCreatedExecution ?? '',
                item.cpuLimit ?? '',
                item.memoryLimit ?? '',
                item.createTime?.toISOString() ?? '',
            ]);
            this.styleDataRow(row, i);
        });
        this.autoFit(sheet);
    }
}
