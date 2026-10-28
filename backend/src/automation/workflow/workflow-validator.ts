import { BadRequestException, Injectable } from '@nestjs/common';
import { ErrorMessages } from '../../common/messages/error-messages';
import { getActionDefinition, getConfigSchemaForAction, getOutputFieldsForNode } from '../action-definitions';
import { collectNodeOutputReferences, collectVariableNames } from '../bindings';
import { normalizeActionType } from '../constants';
import type { WorkflowEdgeSnapshot, WorkflowGraph, WorkflowNodeSnapshot, WorkflowSnapshot } from './workflow.types';

export function buildWorkflowGraph(snapshot: WorkflowSnapshot): WorkflowGraph {
    const adjacency = new Map<string, string[]>();
    const reverseAdjacency = new Map<string, string[]>();

    for (const node of snapshot.nodes) {
        adjacency.set(node.id, []);
        reverseAdjacency.set(node.id, []);
    }

    for (const edge of snapshot.edges) {
        adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
        reverseAdjacency.get(edge.targetNodeId)?.push(edge.sourceNodeId);
    }

    return { nodes: snapshot.nodes, edges: snapshot.edges, adjacency, reverseAdjacency };
}

@Injectable()
export class WorkflowValidator {
    validate(snapshot: WorkflowSnapshot, cloudProvider = 'AWS'): void {
        if (!snapshot.nodes.length) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.FLOW_INVALID);
        }

        const nodeIds = new Set(snapshot.nodes.map((n) => n.id));

        for (const edge of snapshot.edges) {
            if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.INVALID_EDGE);
            }
        }

        this.detectCycle(snapshot);

        for (const node of snapshot.nodes) {
            const canonicalType = normalizeActionType(node.type);
            const definition = getActionDefinition(canonicalType);

            if (!definition) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.UNSUPPORTED_RESOURCE_TYPE);
            }

            if (definition.provider !== cloudProvider) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.PROVIDER_NOT_SUPPORTED);
            }

            const schema = getConfigSchemaForAction(canonicalType);
            if (schema) {
                schema.parse(node.config);
            }

            this.validateNodeReferences(node, snapshot.nodes, snapshot.edges);
        }

        this.validateVariableBindings(snapshot);
    }

    private detectCycle(snapshot: WorkflowSnapshot): void {
        const graph = buildWorkflowGraph(snapshot);
        const indegree = new Map<string, number>();

        for (const node of graph.nodes) {
            indegree.set(node.id, graph.reverseAdjacency.get(node.id)?.length ?? 0);
        }

        const queue: string[] = [];
        for (const [id, degree] of indegree.entries()) {
            if (degree === 0) queue.push(id);
        }

        let visited = 0;
        while (queue.length > 0) {
            const current = queue.shift()!;
            visited++;

            for (const next of graph.adjacency.get(current) ?? []) {
                const nextDegree = (indegree.get(next) ?? 0) - 1;
                indegree.set(next, nextDegree);
                if (nextDegree === 0) queue.push(next);
            }
        }

        if (visited !== graph.nodes.length) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.CYCLE_DETECTED);
        }
    }

    private validateNodeReferences(
        node: WorkflowNodeSnapshot,
        allNodes: WorkflowNodeSnapshot[],
        edges: WorkflowEdgeSnapshot[],
    ): void {
        const canonicalType = normalizeActionType(node.type);
        const definition = getActionDefinition(canonicalType);
        if (!definition) return;

        const refs = collectNodeOutputReferences(node.config);

        for (const ref of refs) {
            const sourceNode = allNodes.find((n) => n.id === ref.nodeId);
            if (!sourceNode) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.INVALID_NODE_REFERENCE);
            }

            const sourceType = normalizeActionType(sourceNode.type);
            const sourceDef = getActionDefinition(sourceType);
            const outputFields = getOutputFieldsForNode(sourceNode);
            if (!sourceDef || !outputFields.includes(ref.field)) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.INVALID_NODE_REFERENCE);
            }

            if (!this.hasDependencyPath(ref.nodeId, node.id, edges)) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.INVALID_NODE_REFERENCE);
            }
        }
    }

    private validateVariableBindings(snapshot: WorkflowSnapshot): void {
        const variables = snapshot.variables ?? {};
        for (const node of snapshot.nodes) {
            for (const name of collectVariableNames(node.config)) {
                if (!variables[name]) {
                    throw new BadRequestException(ErrorMessages.AUTOMATION.INVALID_BINDING);
                }
            }
        }
    }

    private hasDependencyPath(sourceId: string, targetId: string, edges: WorkflowEdgeSnapshot[]): boolean {
        const adjacency = new Map<string, string[]>();
        for (const edge of edges) {
            const list = adjacency.get(edge.sourceNodeId) ?? [];
            list.push(edge.targetNodeId);
            adjacency.set(edge.sourceNodeId, list);
        }

        const visited = new Set<string>();
        const stack = [sourceId];

        while (stack.length > 0) {
            const current = stack.pop()!;
            if (current === targetId) return true;
            if (visited.has(current)) continue;
            visited.add(current);

            for (const next of adjacency.get(current) ?? []) {
                stack.push(next);
            }
        }

        return false;
    }
}
