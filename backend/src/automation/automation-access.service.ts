import { Injectable } from '@nestjs/common';
import { BillingService } from '../billing/billing.service';
import { SystemModule } from '../common/modules/system-modules';

@Injectable()
export class AutomationAccessService {
    constructor(private readonly billingService: BillingService) {}

    async assertAutomationModuleEnabled(tenantId: string): Promise<void> {
        await this.billingService.assertModuleEnabled(tenantId, SystemModule.AUTOMATION);
    }
}
