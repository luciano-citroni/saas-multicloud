import { BadRequestException, Injectable } from '@nestjs/common';
import { ErrorMessages } from '../../common/messages/error-messages';
import { buildWorkflowGraph } from './workflow-validator';
import type { WorkflowSnapshot } from './workflow.types';

@Injectable()
export class DependencyResolver {
    resolveBatches(snapshot: WorkflowSnapshot): string[][] {
        const graph = buildWorkflowGraph(snapshot);
        const indegree = new Map<string, number>();

        for (const node of graph.nodes) {
            indegree.set(node.id, graph.reverseAdjacency.get(node.id)?.length ?? 0);
        }

        const batches: string[][] = [];
        const remaining = new Set(graph.nodes.map((n) => n.id));

        while (remaining.size > 0) {
            const batch = Array.from(remaining).filter((id) => indegree.get(id) === 0);

            if (batch.length === 0) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.CYCLE_DETECTED);
            }

            batches.push(batch);

            for (const nodeId of batch) {
                remaining.delete(nodeId);
                for (const next of graph.adjacency.get(nodeId) ?? []) {
                    indegree.set(next, (indegree.get(next) ?? 0) - 1);
                }
            }
        }

        return batches;
    }

    getDependents(snapshot: WorkflowSnapshot, failedNodeId: string): Set<string> {
        const graph = buildWorkflowGraph(snapshot);
        const dependents = new Set<string>();
        const stack = [...(graph.adjacency.get(failedNodeId) ?? [])];

        while (stack.length > 0) {
            const current = stack.pop()!;
            if (dependents.has(current)) continue;
            dependents.add(current);
            for (const next of graph.adjacency.get(current) ?? []) {
                stack.push(next);
            }
        }

        return dependents;
    }
}
