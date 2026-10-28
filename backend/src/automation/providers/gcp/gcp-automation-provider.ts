import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ErrorMessages } from '../../../common/messages/error-messages';

export interface GcpAutomationContext {
    cloudAccountId: string;
    tenantId: string;
}

@Injectable()
export class GcpAutomationProvider {
    async executeAction(
        _actionType: string,
        _config: Record<string, unknown>,
        _context: GcpAutomationContext,
    ): Promise<{ output: Record<string, unknown>; resourceId: string | null }> {
        throw new InternalServerErrorException(ErrorMessages.AUTOMATION.UNSUPPORTED_RESOURCE_TYPE);
    }
}
