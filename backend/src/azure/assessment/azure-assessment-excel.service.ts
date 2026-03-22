import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import type { AzureAssessmentData } from './azure-assessment-report.service';

@Injectable()
export class AzureAssessmentExcelService {
    private readonly logger = new Logger(AzureAssessmentExcelService.name);

    private applyHeaderStyle(row: ExcelJS.Row, color: string): void {
        row.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: color },
            };
            cell.font = {
                bold: true,
                color: { argb: 'FFFFFFFF' },
            };
            cell.alignment = { horizontal: 'center' };
        });
    }

    private addSheet<T extends Record<string, any>>(
        workbook: ExcelJS.Workbook,
        sheetName: string,
        columns: { header: string; key: string; width: number }[],
        rows: T[],
        headerColor: string,
    ): void {
        const worksheet = workbook.addWorksheet(sheetName);
        worksheet.columns = columns;
        rows.forEach((row) => worksheet.addRow(row));
        this.applyHeaderStyle(worksheet.getRow(1), headerColor);
        worksheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: columns.length },
        };
    }

    async generateExcel(jobId: string, data: AzureAssessmentData): Promise<string> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SaaS Multicloud';
        workbook.created = new Date();

        const color = 'FF0072C6';

        // 1. Subscriptions
        this.addSheet(
            workbook,
            'Subscriptions',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'State', key: 'state', width: 15 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.subscriptions,
            color,
        );

        // 2. Resource Groups
        this.addSheet(
            workbook,
            'Resource Groups',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.resourceGroups,
            color,
        );

        // 3. Virtual Machines
        this.addSheet(
            workbook,
            'Virtual Machines',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'VM Size', key: 'vmSize', width: 20 },
                { header: 'OS Type', key: 'osType', width: 15 },
                { header: 'Provisioning State', key: 'provisioningState', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.virtualMachines,
            color,
        );

        // 4. VM Scale Sets
        this.addSheet(
            workbook,
            'VM Scale Sets',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'SKU', key: 'sku', width: 20 },
                { header: 'Provisioning State', key: 'provisioningState', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.vmss,
            color,
        );

        // 5. AKS Clusters
        this.addSheet(
            workbook,
            'AKS Clusters',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Kubernetes Version', key: 'kubernetesVersion', width: 20 },
                { header: 'Provisioning State', key: 'provisioningState', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.aksClusters,
            color,
        );

        // 6. Disks
        this.addSheet(
            workbook,
            'Disks',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Disk Size (GB)', key: 'diskSizeGb', width: 15 },
                { header: 'Disk State', key: 'diskState', width: 20 },
                { header: 'SKU', key: 'sku', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.disks,
            color,
        );

        // 7. Web Apps
        this.addSheet(
            workbook,
            'Web Apps',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Kind', key: 'kind', width: 20 },
                { header: 'State', key: 'state', width: 15 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.webApps,
            color,
        );

        // 8. App Service Plans
        this.addSheet(
            workbook,
            'App Service Plans',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'SKU', key: 'sku', width: 20 },
                { header: 'Kind', key: 'kind', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.appServicePlans,
            color,
        );

        // 9. Virtual Networks — addressPrefixes requires special handling
        this.addSheet(
            workbook,
            'Virtual Networks',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Address Prefixes', key: 'addressPrefixes', width: 40 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.virtualNetworks.map((r) => ({
                ...r,
                addressPrefixes: Array.isArray(r.addressPrefixes) ? r.addressPrefixes.join(', ') : '',
            })),
            color,
        );

        // 10. Network Interfaces
        this.addSheet(
            workbook,
            'Network Interfaces',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Private IP Address', key: 'privateIpAddress', width: 20 },
                { header: 'Provisioning State', key: 'provisioningState', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.networkInterfaces,
            color,
        );

        // 11. Public IPs
        this.addSheet(
            workbook,
            'Public IPs',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'IP Address', key: 'ipAddress', width: 20 },
                { header: 'Allocation Method', key: 'allocationMethod', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.publicIps,
            color,
        );

        // 12. NSGs
        this.addSheet(
            workbook,
            'NSGs',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.nsgs,
            color,
        );

        // 13. Load Balancers
        this.addSheet(
            workbook,
            'Load Balancers',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'SKU', key: 'sku', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.loadBalancers,
            color,
        );

        // 14. Application Gateways
        this.addSheet(
            workbook,
            'Application Gateways',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'SKU', key: 'sku', width: 20 },
                { header: 'Provisioning State', key: 'provisioningState', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.applicationGateways,
            color,
        );

        // 15. Storage Accounts
        this.addSheet(
            workbook,
            'Storage Accounts',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'SKU', key: 'sku', width: 20 },
                { header: 'Kind', key: 'kind', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.storageAccounts,
            color,
        );

        // 16. SQL Servers
        this.addSheet(
            workbook,
            'SQL Servers',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Fully Qualified Domain Name', key: 'fullyQualifiedDomainName', width: 50 },
                { header: 'Administrator Login', key: 'administratorLogin', width: 25 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.sqlServers,
            color,
        );

        // 17. SQL Databases
        this.addSheet(
            workbook,
            'SQL Databases',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'SKU', key: 'sku', width: 20 },
                { header: 'Status', key: 'status', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.sqlDatabases,
            color,
        );

        // 18. PostgreSQL Servers
        this.addSheet(
            workbook,
            'PostgreSQL Servers',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Administrator Login', key: 'administratorLogin', width: 25 },
                { header: 'Version', key: 'version', width: 15 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.postgresServers,
            color,
        );

        // 19. Cosmos DB
        this.addSheet(
            workbook,
            'Cosmos DB',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'DB Account Offer Type', key: 'databaseAccountOfferType', width: 25 },
                { header: 'Document Endpoint', key: 'documentEndpoint', width: 50 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.cosmosDbAccounts,
            color,
        );

        // 20. Key Vaults
        this.addSheet(
            workbook,
            'Key Vaults',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Vault URI', key: 'vaultUri', width: 50 },
                { header: 'SKU', key: 'sku', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.keyVaults,
            color,
        );

        // 21. Recovery Vaults
        this.addSheet(
            workbook,
            'Recovery Vaults',
            [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'Azure ID', key: 'azureId', width: 60 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Resource Group', key: 'resourceGroup', width: 30 },
                { header: 'Subscription ID', key: 'subscriptionId', width: 36 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'SKU', key: 'sku', width: 20 },
                { header: 'Last Synced At', key: 'lastSyncedAt', width: 20 },
            ],
            data.recoveryVaults,
            color,
        );

        // Summary sheet
        this.addSheet(
            workbook,
            'Summary',
            [
                { header: 'Resource Type', key: 'resourceType', width: 40 },
                { header: 'Count', key: 'count', width: 15 },
            ],
            [
                { resourceType: 'Subscriptions', count: data.subscriptions.length },
                { resourceType: 'Resource Groups', count: data.resourceGroups.length },
                { resourceType: 'Virtual Machines', count: data.virtualMachines.length },
                { resourceType: 'VM Scale Sets', count: data.vmss.length },
                { resourceType: 'AKS Clusters', count: data.aksClusters.length },
                { resourceType: 'Disks', count: data.disks.length },
                { resourceType: 'Web Apps', count: data.webApps.length },
                { resourceType: 'App Service Plans', count: data.appServicePlans.length },
                { resourceType: 'Virtual Networks', count: data.virtualNetworks.length },
                { resourceType: 'Network Interfaces', count: data.networkInterfaces.length },
                { resourceType: 'Public IPs', count: data.publicIps.length },
                { resourceType: 'NSGs', count: data.nsgs.length },
                { resourceType: 'Load Balancers', count: data.loadBalancers.length },
                { resourceType: 'Application Gateways', count: data.applicationGateways.length },
                { resourceType: 'Storage Accounts', count: data.storageAccounts.length },
                { resourceType: 'SQL Servers', count: data.sqlServers.length },
                { resourceType: 'SQL Databases', count: data.sqlDatabases.length },
                { resourceType: 'PostgreSQL Servers', count: data.postgresServers.length },
                { resourceType: 'Cosmos DB Accounts', count: data.cosmosDbAccounts.length },
                { resourceType: 'Key Vaults', count: data.keyVaults.length },
                { resourceType: 'Recovery Vaults', count: data.recoveryVaults.length },
            ],
            color,
        );

        const outputDir = path.join(process.cwd(), 'uploads', 'assessments');

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const fileName = `azure-assessment-${jobId}.xlsx`;
        const filePath = path.join(outputDir, fileName);

        await workbook.xlsx.writeFile(filePath);

        this.logger.log(`Azure assessment Excel generated: ${filePath}`);

        return fileName;
    }

    getExcelFilePath(fileName: string): string {
        return path.join(process.cwd(), 'uploads', 'assessments', fileName);
    }

    async deleteExcel(fileName: string): Promise<void> {
        const filePath = this.getExcelFilePath(fileName);

        try {
            await fs.promises.unlink(filePath);
            this.logger.log(`Azure assessment Excel deleted: ${filePath}`);
        } catch {
            // silent — file may not exist
        }
    }
}
