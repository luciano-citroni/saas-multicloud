import { BadRequestException, Injectable } from '@nestjs/common';
import { ErrorMessages } from '../../common/messages/error-messages';
import { getActionDefinition } from '../action-definitions';
import { normalizeActionType } from '../constants';
import { nodeOutputReferenceSchema } from '../action-definitions';

@Injectable()
export class OutputResolver {
    resolveConfig(
        config: Record<string, unknown>,
        nodeOutputs: Map<string, Record<string, unknown>>,
    ): Record<string, unknown> {
        return this.resolveValue(config, nodeOutputs) as Record<string, unknown>;
    }

    resolveValue(value: unknown, nodeOutputs: Map<string, Record<string, unknown>>): unknown {
        const parsedRef = nodeOutputReferenceSchema.safeParse(value);
        if (parsedRef.success) {
            const output = nodeOutputs.get(parsedRef.data.nodeId);
            if (!output) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.INVALID_NODE_REFERENCE);
            }

            const fieldValue = output[parsedRef.data.field];
            if (fieldValue === undefined) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.INVALID_NODE_REFERENCE);
            }

            return fieldValue;
        }

        if (Array.isArray(value)) {
            return value.map((item) => this.resolveValue(item, nodeOutputs));
        }

        if (value && typeof value === 'object') {
            const result: Record<string, unknown> = {};
            for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
                result[key] = this.resolveValue(child, nodeOutputs);
            }
            return result;
        }

        return value;
    }

    validateReferencesExist(
        nodes: Array<{ id: string; type: string; config: Record<string, unknown> }>,
    ): void {
        const nodeMap = new Map(nodes.map((n) => [n.id, n]));

        for (const node of nodes) {
            const refs = this.collectReferences(node.config);
            for (const ref of refs) {
                const source = nodeMap.get(ref.nodeId);
                if (!source) {
                    throw new BadRequestException(ErrorMessages.AUTOMATION.INVALID_NODE_REFERENCE);
                }

                const sourceType = normalizeActionType(source.type);
                const def = getActionDefinition(sourceType);
                if (!def?.outputFields.includes(ref.field)) {
                    throw new BadRequestException(ErrorMessages.AUTOMATION.INVALID_NODE_REFERENCE);
                }
            }
        }
    }

    private collectReferences(value: unknown): Array<{ nodeId: string; field: string }> {
        const refs: Array<{ nodeId: string; field: string }> = [];

        const walk = (current: unknown) => {
            const parsed = nodeOutputReferenceSchema.safeParse(current);
            if (parsed.success) {
                refs.push({ nodeId: parsed.data.nodeId, field: parsed.data.field });
                return;
            }

            if (Array.isArray(current)) {
                current.forEach(walk);
                return;
            }

            if (current && typeof current === 'object') {
                Object.values(current as Record<string, unknown>).forEach(walk);
            }
        };

        walk(value);
        return refs;
    }
}
