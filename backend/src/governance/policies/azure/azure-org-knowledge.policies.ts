import { Injectable } from '@nestjs/common';
import { AzureNsg } from '../../../db/entites/azure-nsg.entity';
import { AzureSqlDatabase } from '../../../db/entites/azure-sql-database.entity';
import { AzureStorageAccount } from '../../../db/entites/azure-storage-account.entity';
import { AzureVirtualMachine } from '../../../db/entites/azure-virtual-machine.entity';
import { AzureWebApp } from '../../../db/entites/azure-web-app.entity';
import {
    evaluateNamingFinding,
    evaluateRequiredTagsFinding,
    resolveApplicableNamingPatterns,
    resolveApplicableRequiredTags,
} from '../org-knowledge-policy.helpers';
import {
    FindingSeverity,
    GovernancePolicy,
    PolicyContext,
    PolicyEvaluationResult,
} from '../policy.interface';

function asResults(result: PolicyEvaluationResult | null): PolicyEvaluationResult[] {
    return result ? [result] : [];
}

@Injectable()
export class AzureVmRequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'azure-vm-required-tags';
    readonly name = 'Azure VM Must Have Required Tags';
    readonly description =
        'Azure VMs must have organization-required tags from the knowledge base when configured.';
    readonly resourceType = 'AzureVirtualMachine';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'azure';
    readonly category = 'compute' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(vm: AzureVirtualMachine, context: PolicyContext): PolicyEvaluationResult[] {
        const requiredTags = resolveApplicableRequiredTags(context, 'azure', this.resourceType);
        if (!requiredTags) return [];
        return [
            evaluateRequiredTagsFinding({
                resourceId: vm.azureId || vm.name,
                resourceType: this.resourceType,
                resourceLabel: `Azure VM "${vm.name}"`,
                tags: vm.tags,
                requiredTags,
            }),
        ];
    }
}

@Injectable()
export class AzureStorageRequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'azure-storage-required-tags';
    readonly name = 'Azure Storage Account Must Have Required Tags';
    readonly description =
        'Azure storage accounts must have organization-required tags from the knowledge base when configured.';
    readonly resourceType = 'AzureStorageAccount';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'azure';
    readonly category = 'storage' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(account: AzureStorageAccount, context: PolicyContext): PolicyEvaluationResult[] {
        const requiredTags = resolveApplicableRequiredTags(context, 'azure', this.resourceType);
        if (!requiredTags) return [];
        return [
            evaluateRequiredTagsFinding({
                resourceId: account.azureId || account.name,
                resourceType: this.resourceType,
                resourceLabel: `Azure storage account "${account.name}"`,
                tags: account.tags,
                requiredTags,
            }),
        ];
    }
}

@Injectable()
export class AzureSqlRequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'azure-sql-required-tags';
    readonly name = 'Azure SQL Database Must Have Required Tags';
    readonly description =
        'Azure SQL databases must have organization-required tags from the knowledge base when configured.';
    readonly resourceType = 'AzureSqlDatabase';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'azure';
    readonly category = 'storage' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(db: AzureSqlDatabase, context: PolicyContext): PolicyEvaluationResult[] {
        const requiredTags = resolveApplicableRequiredTags(context, 'azure', this.resourceType);
        if (!requiredTags) return [];
        return [
            evaluateRequiredTagsFinding({
                resourceId: db.azureId || db.name,
                resourceType: this.resourceType,
                resourceLabel: `Azure SQL database "${db.name}"`,
                tags: db.tags,
                requiredTags,
            }),
        ];
    }
}

@Injectable()
export class AzureWebAppRequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'azure-webapp-required-tags';
    readonly name = 'Azure Web App Must Have Required Tags';
    readonly description =
        'Azure Web Apps must have organization-required tags from the knowledge base when configured.';
    readonly resourceType = 'AzureWebApp';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'azure';
    readonly category = 'compute' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(app: AzureWebApp, context: PolicyContext): PolicyEvaluationResult[] {
        const requiredTags = resolveApplicableRequiredTags(context, 'azure', this.resourceType);
        if (!requiredTags) return [];
        return [
            evaluateRequiredTagsFinding({
                resourceId: app.azureId || app.name,
                resourceType: this.resourceType,
                resourceLabel: `Azure Web App "${app.name}"`,
                tags: app.tags,
                requiredTags,
            }),
        ];
    }
}

@Injectable()
export class AzureNsgRequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'azure-nsg-required-tags';
    readonly name = 'Azure NSG Must Have Required Tags';
    readonly description =
        'Azure NSGs must have organization-required tags from the knowledge base when configured.';
    readonly resourceType = 'AzureNsg';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'azure';
    readonly category = 'network' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(nsg: AzureNsg, context: PolicyContext): PolicyEvaluationResult[] {
        const requiredTags = resolveApplicableRequiredTags(context, 'azure', this.resourceType);
        if (!requiredTags) return [];
        return [
            evaluateRequiredTagsFinding({
                resourceId: nsg.azureId || nsg.name,
                resourceType: this.resourceType,
                resourceLabel: `Azure NSG "${nsg.name}"`,
                tags: nsg.tags,
                requiredTags,
            }),
        ];
    }
}

@Injectable()
export class AzureVmNamingPolicy implements GovernancePolicy {
    readonly id = 'azure-vm-naming';
    readonly name = 'Azure VM Must Match Naming Pattern';
    readonly description =
        'Azure VM names must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'AzureVirtualMachine';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'azure';
    readonly category = 'compute' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(vm: AzureVirtualMachine, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'azure', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: vm.azureId || vm.name,
                resourceType: this.resourceType,
                resourceLabel: `Azure VM "${vm.name}"`,
                nameValue: vm.name,
                patterns,
            }),
        );
    }
}

@Injectable()
export class AzureStorageNamingPolicy implements GovernancePolicy {
    readonly id = 'azure-storage-naming';
    readonly name = 'Azure Storage Account Must Match Naming Pattern';
    readonly description =
        'Azure storage account names must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'AzureStorageAccount';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'azure';
    readonly category = 'storage' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(account: AzureStorageAccount, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'azure', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: account.azureId || account.name,
                resourceType: this.resourceType,
                resourceLabel: `Azure storage account "${account.name}"`,
                nameValue: account.name,
                patterns,
            }),
        );
    }
}

@Injectable()
export class AzureSqlNamingPolicy implements GovernancePolicy {
    readonly id = 'azure-sql-naming';
    readonly name = 'Azure SQL Database Must Match Naming Pattern';
    readonly description =
        'Azure SQL database names must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'AzureSqlDatabase';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'azure';
    readonly category = 'storage' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(db: AzureSqlDatabase, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'azure', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: db.azureId || db.name,
                resourceType: this.resourceType,
                resourceLabel: `Azure SQL database "${db.name}"`,
                nameValue: db.name,
                patterns,
            }),
        );
    }
}

@Injectable()
export class AzureWebAppNamingPolicy implements GovernancePolicy {
    readonly id = 'azure-webapp-naming';
    readonly name = 'Azure Web App Must Match Naming Pattern';
    readonly description =
        'Azure Web App names must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'AzureWebApp';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'azure';
    readonly category = 'compute' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(app: AzureWebApp, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'azure', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: app.azureId || app.name,
                resourceType: this.resourceType,
                resourceLabel: `Azure Web App "${app.name}"`,
                nameValue: app.name,
                patterns,
            }),
        );
    }
}

@Injectable()
export class AzureNsgNamingPolicy implements GovernancePolicy {
    readonly id = 'azure-nsg-naming';
    readonly name = 'Azure NSG Must Match Naming Pattern';
    readonly description =
        'Azure NSG names must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'AzureNsg';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'azure';
    readonly category = 'network' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(nsg: AzureNsg, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'azure', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: nsg.azureId || nsg.name,
                resourceType: this.resourceType,
                resourceLabel: `Azure NSG "${nsg.name}"`,
                nameValue: nsg.name,
                patterns,
            }),
        );
    }
}
