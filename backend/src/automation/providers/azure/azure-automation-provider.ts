import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ErrorMessages } from '../../../common/messages/error-messages';

export interface AzureAutomationContext {
    cloudAccountId: string;
    tenantId: string;
}

@Injectable()
export class AzureAutomationProvider {
    async executeAction(
        _actionType: string,
        _config: Record<string, unknown>,
        _context: AzureAutomationContext,
    ): Promise<{ output: Record<string, unknown>; resourceId: string | null }> {
        throw new InternalServerErrorException(ErrorMessages.AUTOMATION.UNSUPPORTED_RESOURCE_TYPE);
    }
}
