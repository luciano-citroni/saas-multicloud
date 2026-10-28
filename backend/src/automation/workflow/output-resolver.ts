import { BadRequestException, Injectable } from '@nestjs/common';
import { ErrorMessages } from '../../common/messages/error-messages';
import { valueBindingSchema } from '../bindings';

@Injectable()
export class OutputResolver {
    resolveConfig(
        config: Record<string, unknown>,
        nodeOutputs: Map<string, Record<string, unknown>>,
        variables: Record<string, unknown> = {},
    ): Record<string, unknown> {
        return this.resolveValue(config, nodeOutputs, variables) as Record<string, unknown>;
    }

    resolveValue(
        value: unknown,
        nodeOutputs: Map<string, Record<string, unknown>>,
        variables: Record<string, unknown> = {},
    ): unknown {
        const parsed = valueBindingSchema.safeParse(value);
        if (parsed.success) {
            switch (parsed.data.type) {
                case 'LITERAL':
                    return this.resolveValue(parsed.data.value, nodeOutputs, variables);
                case 'VARIABLE': {
                    if (!(parsed.data.name in variables)) {
                        throw new BadRequestException(ErrorMessages.AUTOMATION.VARIABLE_UNRESOLVED);
                    }
                    return variables[parsed.data.name];
                }
                case 'NODE_OUTPUT': {
                    const output = nodeOutputs.get(parsed.data.nodeId);
                    if (!output || output[parsed.data.field] === undefined) {
                        throw new BadRequestException(ErrorMessages.AUTOMATION.INVALID_NODE_REFERENCE);
                    }
                    return output[parsed.data.field];
                }
                case 'EXISTING_RESOURCE':
                    return parsed.data.resourceId;
                default:
                    return value;
            }
        }

        if (Array.isArray(value)) {
            return value.map((item) => this.resolveValue(item, nodeOutputs, variables));
        }

        if (value && typeof value === 'object') {
            const result: Record<string, unknown> = {};
            for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
                result[key] = this.resolveValue(child, nodeOutputs, variables);
            }
            return result;
        }

        return value;
    }
}
