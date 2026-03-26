import type { Edge, Node } from '@xyflow/react';
import dagre from 'dagre';
import type {
    ArchitectureNodeData,
    AssessmentProvider,
    GroupingDimension,
    GroupingMode,
    ResourceVisibilityFilterId,
} from '@/components/root/assessment/types';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 88;
const GROUP_PADDING_X = 24;
const GROUP_PADDING_Y = 16;
const GROUP_HEADER_HEIGHT = 34;
const GROUP_GAP_X = 48;
const GROUP_GAP_Y = 52;
const GROUP_MAX_ROW_WIDTH = 4800;

export const RESOURCE_VISIBILITY_FILTER_OPTIONS: Array<{ id: ResourceVisibilityFilterId; label: string }> = [
    { id: 'securityGroups', label: 'Security Groups' },
    { id: 'taskDefinitions', label: 'Task Definitions' },
    { id: 'managedIdentities', label: 'Managed Identities' },
];

function matches(value: string, terms: string[]): boolean {
    return terms.some((term) => value.includes(term));
}

function getResourceGroup(resourceType: string | undefined): string {
    const value = (resourceType ?? '').toLowerCase();

    if (
        matches(value, [
            'vpc',
            'vnet',
            'subnet',
            'route table',
            'route-table',
            'load balancer',
            'application gateway',
            'front door',
            'public ip',
            'nat gateway',
            'network interface',
            'network security group',
            'security group',
            'dns',
            'gateway',
        ])
    ) {
        return 'Network / Edge';
    }

    if (matches(value, ['ec2', 'ecs', 'eks', 'container', 'vm', 'virtual machine', 'scale set', 'aks', 'app service', 'web app', 'kubernetes'])) {
        return 'Compute / Containers';
    }

    if (matches(value, ['lambda', 'function app', 'azure function', 'api gateway'])) {
        return 'Serverless';
    }

    if (
        matches(value, [
            'rds',
            'database',
            'dynamo',
            'cosmos',
            'sql',
            'postgres',
            'mysql',
            'storage account',
            'blob',
            'bucket',
            's3',
            'cache',
            'redis',
            'disk',
        ])
    ) {
        return 'Data / Storage';
    }

    if (matches(value, ['iam', 'role', 'policy', 'key vault', 'kms', 'secret', 'defender', 'waf'])) {
        return 'Identity / Security';
    }

    if (matches(value, ['sqs', 'sns', 'service bus', 'event grid', 'queue', 'topic', 'notification'])) {
        return 'Messaging / Integration';
    }

    if (matches(value, ['cloudwatch', 'cloudtrail', 'monitor', 'log analytics', 'insights'])) {
        return 'Observability / Governance';
    }

    return 'Others';
}

function getGroupPriority(label: string): number {
    const order = [
        'Network / Edge',
        'Compute / Containers',
        'Serverless',
        'Data / Storage',
        'Identity / Security',
        'Messaging / Integration',
        'Observability / Governance',
        'Others',
    ];
    const index = order.indexOf(label);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function normalizeGroupId(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function regionFromAvailabilityZone(value: string): string | null {
    const trimmed = value.trim().toLowerCase();

    // AWS AZ: us-east-1a -> us-east-1
    const awsMatch = trimmed.match(/^([a-z]{2}(?:-gov)?-[a-z]+-\d)[a-z]$/i);
    if (awsMatch?.[1]) {
        return awsMatch[1];
    }

    // Azure zones may look like: brazilsouth-1
    const azureMatch = trimmed.match(/^([a-z0-9-]+)-\d+$/i);
    if (azureMatch?.[1]) {
        return azureMatch[1];
    }

    return null;
}

function inferNodeRegion(data: ArchitectureNodeData): string | null {
    const groupRegion = data.group?.region;
    if (typeof groupRegion === 'string' && groupRegion.trim().length > 0) {
        return groupRegion.trim();
    }

    const details = data.details as Record<string, unknown> | undefined;

    const explicitRegion = details?.region;
    if (typeof explicitRegion === 'string' && explicitRegion.trim().length > 0) {
        return explicitRegion.trim();
    }

    const location = details?.location;
    if (typeof location === 'string' && location.trim().length > 0) {
        return location.trim();
    }

    const az = details?.availabilityZone;
    if (typeof az === 'string' && az.trim().length > 0) {
        return regionFromAvailabilityZone(az) ?? az.trim();
    }

    return null;
}

function getNodeGroupLabel(node: Node, groupingMode: GroupingMode): string {
    const data = (node.data ?? {}) as ArchitectureNodeData;

    if (groupingMode === 'resourceType') {
        return getResourceGroup(data.resourceType);
    }

    if (groupingMode === 'vpc') {
        const networkName = data.group?.vpcName;
        if (typeof networkName === 'string' && networkName.trim().length > 0) {
            return `Network: ${networkName}`;
        }

        if (typeof data.label === 'string' && data.label.trim().length > 0 && matches((data.resourceType ?? '').toLowerCase(), ['vpc', 'vnet'])) {
            return `Network: ${data.label}`;
        }

        return 'Network: Shared / Global';
    }

    if (groupingMode === 'region') {
        const region = inferNodeRegion(data);
        if (typeof region === 'string' && region.trim().length > 0) {
            return `Region: ${region}`;
        }

        return 'Region: N/A';
    }

    return 'All Resources';
}

function isVpcNode(node: Node): boolean {
    const data = (node.data ?? {}) as ArchitectureNodeData;
    const resourceType = (data.resourceType ?? '').toLowerCase();

    return matches(resourceType, ['vpc', 'vnet']);
}

function isSubnetNode(node: Node): boolean {
    const data = (node.data ?? {}) as ArchitectureNodeData;
    const resourceType = (data.resourceType ?? '').toLowerCase();

    return resourceType.includes('subnet');
}

function layoutNodesWithDagre(children: Node[], allEdges: Edge[], rankdir: 'TB' | 'LR' = 'LR'): Node[] {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir, ranksep: 100, nodesep: 20, marginx: 0, marginy: 0, acyclicer: 'greedy', ranker: 'network-simplex' });

    for (const child of children) {
        graph.setNode(child.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    const nodeIds = new Set(children.map((child) => child.id));
    for (const edge of allEdges) {
        if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
            graph.setEdge(edge.source, edge.target);
        }
    }

    dagre.layout(graph);

    return children.map((child, index) => {
        const positioned = graph.node(child.id) as { x: number; y: number } | undefined;

        if (!positioned) {
            return {
                ...child,
                position: {
                    x: 0,
                    y: index * (NODE_HEIGHT + 18),
                },
            };
        }

        return {
            ...child,
            position: {
                x: positioned.x - NODE_WIDTH / 2,
                y: positioned.y - NODE_HEIGHT / 2,
            },
        };
    });
}

function normalizeLaidOutNodes(children: Node[]): { nodes: Node[]; width: number; height: number } {
    if (!children.length) {
        return { nodes: [], width: 0, height: 0 };
    }

    const minX = Math.min(...children.map((child) => child.position.x));
    const minY = Math.min(...children.map((child) => child.position.y));
    const shiftedNodes = children.map((child) => ({
        ...child,
        position: {
            x: child.position.x - minX,
            y: child.position.y - minY,
        },
    }));

    const width = Math.max(...shiftedNodes.map((child) => child.position.x + NODE_WIDTH));
    const height = Math.max(...shiftedNodes.map((child) => child.position.y + NODE_HEIGHT));

    return {
        nodes: shiftedNodes,
        width,
        height,
    };
}

function layoutNodesInGroup(children: Node[], allEdges: Edge[]): Node[] {
    const laidOutChildren = layoutNodesWithDagre(children, allEdges, 'TB');

    return laidOutChildren.map((child, index) => {
        const positioned = child.position;

        if (!positioned) {
            return {
                ...child,
                position: {
                    x: GROUP_PADDING_X,
                    y: GROUP_PADDING_Y + GROUP_HEADER_HEIGHT + index * (NODE_HEIGHT + 16),
                },
            };
        }

        return {
            ...child,
            position: {
                x: positioned.x + GROUP_PADDING_X,
                y: positioned.y + GROUP_PADDING_Y + GROUP_HEADER_HEIGHT,
            },
        };
    });
}

function isRouteTableNode(node: Node): boolean {
    const data = (node.data ?? {}) as ArchitectureNodeData;
    const type = (data.resourceType ?? '').toLowerCase();
    return type.includes('route table') || type.includes('route-table') || node.id.startsWith('rt:');
}

function buildVpcHierarchyNodes(resourceNodes: Node[], allEdges: Edge[]): Node[] {
    // ── 1. Group all nodes under their VPC label ────────────────────────────
    const groups = new Map<string, Node[]>();
    const labelsById = new Map<string, string>();

    for (const node of resourceNodes) {
        const label = getNodeGroupLabel(node, 'vpc');
        const groupId = `group:${normalizeGroupId(label) || 'default'}`;
        const list = groups.get(groupId) ?? [];
        list.push(node);
        groups.set(groupId, list);
        labelsById.set(groupId, label);
    }

    // Layout constants
    const COLUMN_GAP = 64; // horizontal gap between columns
    const ROW_ITEM_GAP = 10; // vertical gap between stacked items within a subnet row
    const SUBNET_ROW_GAP = 28; // vertical gap between distinct subnet rows
    const SECTION_GAP_Y = 36; // gap between subnet section and VPC-level extras

    const preparedGroups = Array.from(groups.entries())
        .sort((a, b) => (labelsById.get(a[0]) ?? a[0]).localeCompare(labelsById.get(b[0]) ?? b[0], 'pt-BR'))
        .map(([groupId, children]) => {
            const label = labelsById.get(groupId) ?? groupId.replace('group:', '');
            const childNodeById = new Map(children.map((n) => [n.id, n]));

            const vpcNodes = children.filter(isVpcNode);
            const subnetNodes = children.filter(isSubnetNode);

            // ── 2. Build route tables per subnet ──────────────────────────────
            // Edges: rt:xxx → subnet:xxx with rel routes-subnet|main-route
            const routeTablesBySubnetId = new Map<string, Node[]>();

            for (const edge of allEdges) {
                if (!childNodeById.has(edge.source) || !childNodeById.has(edge.target)) continue;
                if (!edge.source.startsWith('rt:')) continue;
                const rel = ((edge.data as Record<string, unknown>)?.relationship as string)?.toLowerCase() ?? '';
                if (rel !== 'routes-subnet' && rel !== 'main-route') continue;
                if (!edge.target.startsWith('subnet:')) continue;
                const rtNode = childNodeById.get(edge.source);
                if (!rtNode) continue;
                const list = routeTablesBySubnetId.get(edge.target) ?? [];
                if (!list.some((n) => n.id === rtNode.id)) {
                    list.push(rtNode);
                    routeTablesBySubnetId.set(edge.target, list);
                }
            }

            // ── 3. Build hosted resources per subnet ──────────────────────────
            // Edges: subnet:xxx → resource with rel hosts|runs-in-subnet
            const hostedBySubnetId = new Map<string, Node[]>();

            for (const edge of allEdges) {
                if (!childNodeById.has(edge.source) || !childNodeById.has(edge.target)) continue;
                if (!edge.source.startsWith('subnet:')) continue;
                const rel = ((edge.data as Record<string, unknown>)?.relationship as string)?.toLowerCase() ?? '';
                if (rel !== 'hosts' && rel !== 'runs-in-subnet') continue;
                const targetNode = childNodeById.get(edge.target);
                if (!targetNode || isVpcNode(targetNode) || isSubnetNode(targetNode) || isRouteTableNode(targetNode)) continue;
                const list = hostedBySubnetId.get(edge.source) ?? [];
                if (!list.some((n) => n.id === targetNode.id)) {
                    list.push(targetNode);
                    hostedBySubnetId.set(edge.source, list);
                }
            }

            // ── 4. Fixed column X positions (same for every subnet row) ────────
            //   COL_VPC | COL_SUBNET | [COL_RT] | COL_RESOURCE
            const hasAnyRouteTables = subnetNodes.some((s) => (routeTablesBySubnetId.get(s.id) ?? []).length > 0);
            const COL_VPC = GROUP_PADDING_X;
            const COL_SUBNET = COL_VPC + NODE_WIDTH + COLUMN_GAP;
            const COL_RT = COL_SUBNET + NODE_WIDTH + COLUMN_GAP;
            const COL_RESOURCE = hasAnyRouteTables ? COL_RT + NODE_WIDTH + COLUMN_GAP : COL_RT;

            const positionedChildren: Node[] = [];
            // Track placed IDs to deduplicate route tables shared across subnets
            const placedNodeIds = new Set<string>();

            // ── 5. Layout each subnet as its own horizontal row ────────────────
            //   [VPC]  [Subnet N]  [RouteTable N1]  [Resource A]
            //                                        [Resource B]
            //          [Subnet M]  [RouteTable M1]  [Resource C]
            //
            //   VPC is placed last (centered vertically over all rows).
            let rowY = GROUP_PADDING_Y + GROUP_HEADER_HEIGHT;

            for (const subnetNode of subnetNodes) {
                const routeTables = routeTablesBySubnetId.get(subnetNode.id) ?? [];
                const resources = hostedBySubnetId.get(subnetNode.id) ?? [];
                const uniqueResources = resources.filter((r) => !placedNodeIds.has(r.id));

                // Row height = tallest column (subnet always 1 item, RT/resource may stack)
                const maxItems = Math.max(1, routeTables.length, uniqueResources.length);
                const rowHeight = maxItems * NODE_HEIGHT + (maxItems - 1) * ROW_ITEM_GAP;

                // Subnet node: vertically centered within the row
                const subnetY = rowY + Math.round((rowHeight - NODE_HEIGHT) / 2);
                positionedChildren.push({ ...subnetNode, position: { x: COL_SUBNET, y: subnetY } });
                placedNodeIds.add(subnetNode.id);

                // Route tables: stacked from the top of the row
                routeTables.forEach((rtNode, i) => {
                    // Route tables may be shared across subnets — use per-subnet instance ID
                    const instanceId = placedNodeIds.has(rtNode.id) ? `${rtNode.id}__${subnetNode.id}` : rtNode.id;
                    placedNodeIds.add(instanceId);
                    positionedChildren.push({
                        ...rtNode,
                        id: instanceId,
                        position: { x: COL_RT, y: rowY + i * (NODE_HEIGHT + ROW_ITEM_GAP) },
                    });
                });

                // Resources: stacked from the top of the row
                uniqueResources.forEach((resNode, i) => {
                    placedNodeIds.add(resNode.id);
                    positionedChildren.push({
                        ...resNode,
                        position: { x: COL_RESOURCE, y: rowY + i * (NODE_HEIGHT + ROW_ITEM_GAP) },
                    });
                });

                rowY += rowHeight + SUBNET_ROW_GAP;
            }

            // ── 6. VPC node: left column, vertically centered over all subnet rows
            if (vpcNodes[0]) {
                const contentHeight = rowY - SUBNET_ROW_GAP - (GROUP_PADDING_Y + GROUP_HEADER_HEIGHT);
                const vpcY =
                    contentHeight > NODE_HEIGHT
                        ? GROUP_PADDING_Y + GROUP_HEADER_HEIGHT + Math.round(contentHeight / 2 - NODE_HEIGHT / 2)
                        : GROUP_PADDING_Y + GROUP_HEADER_HEIGHT;
                positionedChildren.push({
                    ...vpcNodes[0],
                    position: { x: COL_VPC, y: vpcY },
                });
                placedNodeIds.add(vpcNodes[0].id);
            }

            // ── 7. VPC-level extras (resources not attached to any subnet) ──────
            const vpcLevelExtras = children.filter((n) => !placedNodeIds.has(n.id) && !isVpcNode(n));

            if (vpcLevelExtras.length > 0) {
                const subnetSectionBottom = positionedChildren.length
                    ? Math.max(...positionedChildren.map((c) => c.position.y + NODE_HEIGHT))
                    : GROUP_PADDING_Y + GROUP_HEADER_HEIGHT;

                const laidOut = normalizeLaidOutNodes(layoutNodesWithDagre(vpcLevelExtras, allEdges, 'LR'));
                const extraStartY = subnetSectionBottom + SECTION_GAP_Y;

                for (const child of laidOut.nodes) {
                    positionedChildren.push({
                        ...child,
                        position: { x: GROUP_PADDING_X + child.position.x, y: extraStartY + child.position.y },
                    });
                }
            }

            // ── 8. Compute group bounding box ───────────────────────────────────
            const width = positionedChildren.length
                ? Math.max(...positionedChildren.map((c) => c.position.x + NODE_WIDTH)) + GROUP_PADDING_X
                : NODE_WIDTH + GROUP_PADDING_X * 2;
            const height = positionedChildren.length
                ? Math.max(...positionedChildren.map((c) => c.position.y + NODE_HEIGHT)) + GROUP_PADDING_Y
                : NODE_HEIGHT + GROUP_PADDING_Y * 2 + GROUP_HEADER_HEIGHT;

            return { groupId, label, width, height, children: positionedChildren };
        });

    // ── 9. Wrap groups across the canvas ────────────────────────────────────
    const grouped: Node[] = [];
    let currentX = 0;
    let currentY = 0;
    let currentRowHeight = 0;

    for (const group of preparedGroups) {
        if (currentX > 0 && currentX + group.width > GROUP_MAX_ROW_WIDTH) {
            currentX = 0;
            currentY += currentRowHeight + GROUP_GAP_Y;
            currentRowHeight = 0;
        }

        grouped.push({
            id: group.groupId,
            type: 'resourceGroup',
            position: { x: currentX, y: currentY },
            data: { label: group.label },
            draggable: false,
            selectable: false,
            style: { width: group.width, height: group.height, zIndex: 0 },
        });

        for (const child of group.children) {
            grouped.push({ ...child, parentId: group.groupId, extent: 'parent' });
        }

        currentX += group.width + GROUP_GAP_X;
        currentRowHeight = Math.max(currentRowHeight, group.height);
    }

    return grouped;
}

export function buildGroupedNodesByModes(resourceNodes: Node[], allEdges: Edge[], groupingModes: GroupingDimension[]): Node[] {
    if (!resourceNodes.length) {
        return [];
    }

    if (groupingModes.length === 0) {
        return resourceNodes;
    }

    if (groupingModes.length === 1 && groupingModes[0] === 'vpc') {
        return buildVpcHierarchyNodes(resourceNodes, allEdges);
    }

    const selectedModes = groupingModes;

    const groups = new Map<string, Node[]>();
    const labelsById = new Map<string, string>();

    for (const node of resourceNodes) {
        const labels = selectedModes.map((mode) => getNodeGroupLabel(node, mode));
        const label = labels.join(' • ');
        const groupId = `group:${normalizeGroupId(label) || 'default'}`;

        const list = groups.get(groupId) ?? [];
        list.push(node);
        groups.set(groupId, list);
        labelsById.set(groupId, label);
    }

    const orderedGroups = Array.from(groups.entries()).sort((a, b) => {
        const aLabel = labelsById.get(a[0]) ?? a[0].replace('group:', '');
        const bLabel = labelsById.get(b[0]) ?? b[0].replace('group:', '');

        if (selectedModes.length === 1 && selectedModes[0] === 'resourceType') {
            return getGroupPriority(aLabel) - getGroupPriority(bLabel);
        }

        return aLabel.localeCompare(bLabel, 'pt-BR');
    });

    const preparedGroups = orderedGroups.map(([groupId, children]) => {
        const label = labelsById.get(groupId) ?? groupId.replace('group:', '');
        const laidOutChildren = layoutNodesInGroup(children, allEdges);

        const maxChildX = Math.max(...laidOutChildren.map((child) => child.position.x + NODE_WIDTH));
        const maxChildY = Math.max(...laidOutChildren.map((child) => child.position.y + NODE_HEIGHT));

        const width = Math.max(maxChildX + GROUP_PADDING_X, NODE_WIDTH + GROUP_PADDING_X * 2);
        const height = Math.max(maxChildY + GROUP_PADDING_Y, NODE_HEIGHT + GROUP_PADDING_Y * 2 + GROUP_HEADER_HEIGHT);

        return {
            groupId,
            label,
            width,
            height,
            children: laidOutChildren,
        };
    });

    const grouped: Node[] = [];
    let currentX = 0;
    let currentY = 0;
    let currentRowHeight = 0;

    for (const group of preparedGroups) {
        if (currentX > 0 && currentX + group.width > GROUP_MAX_ROW_WIDTH) {
            currentX = 0;
            currentY += currentRowHeight + GROUP_GAP_Y;
            currentRowHeight = 0;
        }

        grouped.push({
            id: group.groupId,
            type: 'resourceGroup',
            position: { x: currentX, y: currentY },
            data: { label: group.label },
            draggable: false,
            selectable: false,
            style: {
                width: group.width,
                height: group.height,
                zIndex: 0,
            },
        });

        for (const child of group.children) {
            grouped.push({
                ...child,
                parentId: group.groupId,
                extent: 'parent',
            });
        }

        currentX += group.width + GROUP_GAP_X;
        currentRowHeight = Math.max(currentRowHeight, group.height);
    }

    return grouped;
}

export function buildGroupedNodes(resourceNodes: Node[], allEdges: Edge[], groupingMode: GroupingMode): Node[] {
    if (groupingMode === 'none') {
        return buildGroupedNodesByModes(resourceNodes, allEdges, []);
    }

    return buildGroupedNodesByModes(resourceNodes, allEdges, [groupingMode]);
}

export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
    if (!nodes.length) {
        return [];
    }

    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 20, marginx: 56, marginy: 56, acyclicer: 'greedy', ranker: 'network-simplex' });

    for (const node of nodes) {
        graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    for (const edge of edges) {
        graph.setEdge(edge.source, edge.target);
    }

    dagre.layout(graph);

    return nodes.map((node) => {
        const positionedNode = graph.node(node.id) as { x: number; y: number } | undefined;

        if (!positionedNode) {
            return node;
        }

        return {
            ...node,
            position: {
                x: positionedNode.x - NODE_WIDTH / 2,
                y: positionedNode.y - NODE_HEIGHT / 2,
            },
        };
    });
}

export function normalizeNodes(nodes: unknown): Node[] {
    if (!Array.isArray(nodes)) {
        return [];
    }

    return nodes
        .filter((node) => typeof node === 'object' && node !== null)
        .map((node) => {
            const candidate = node as Partial<Node>;
            return {
                id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(),
                type: 'architectureNode',
                position:
                    candidate.position && typeof candidate.position.x === 'number' && typeof candidate.position.y === 'number'
                        ? candidate.position
                        : { x: 0, y: 0 },
                data:
                    candidate.data && typeof candidate.data === 'object'
                        ? candidate.data
                        : {
                              label: 'Resource',
                              resourceType: 'Unknown',
                          },
            } as Node;
        });
}

type EdgeVisual = {
    color: string;
    strokeWidth: number;
    strokeDasharray: string;
    animated: boolean;
    label: string;
};

const EDGE_VISUALS: Record<string, EdgeVisual> = {
    // ── Networking ─────────────────────────────────────────────────────────
    network: {
        color: '#3b82f6', // blue
        strokeWidth: 2.5,
        strokeDasharray: '',
        animated: true,
        label: 'network',
    },
    dns: {
        color: '#8b5cf6', // purple
        strokeWidth: 2.5,
        strokeDasharray: '',
        animated: true,
        label: 'DNS',
    },
    'http-s': {
        color: '#06b6d4', // cyan
        strokeWidth: 2.5,
        strokeDasharray: '',
        animated: true,
        label: 'HTTPS',
    },
    invoke: {
        color: '#f97316', // orange
        strokeWidth: 2.5,
        strokeDasharray: '',
        animated: true,
        label: 'invoke',
    },
    'routes-traffic-to': {
        color: '#06b6d4', // cyan
        strokeWidth: 2.5,
        strokeDasharray: '',
        animated: true,
        label: 'routes traffic',
    },
    // ── Containment / Hosting ──────────────────────────────────────────────
    contains: {
        color: '#64748b', // slate
        strokeWidth: 1.5,
        strokeDasharray: '5 4',
        animated: false,
        label: 'contains',
    },
    'contains-load-balancer': {
        color: '#64748b',
        strokeWidth: 1.5,
        strokeDasharray: '5 4',
        animated: false,
        label: 'load balancer',
    },
    'contains-database': {
        color: '#64748b',
        strokeWidth: 1.5,
        strokeDasharray: '5 4',
        animated: false,
        label: 'database',
    },
    'contains-cache': {
        color: '#64748b',
        strokeWidth: 1.5,
        strokeDasharray: '5 4',
        animated: false,
        label: 'cache',
    },
    'contains-workload': {
        color: '#64748b',
        strokeWidth: 1.5,
        strokeDasharray: '5 4',
        animated: false,
        label: 'workload',
    },
    'contains-serverless': {
        color: '#64748b',
        strokeWidth: 1.5,
        strokeDasharray: '5 4',
        animated: false,
        label: 'serverless',
    },
    hosts: {
        color: '#f59e0b', // amber
        strokeWidth: 2,
        strokeDasharray: '',
        animated: false,
        label: 'hosts',
    },
    // ── Route tables ───────────────────────────────────────────────────────
    'routes-subnet': {
        color: '#10b981', // emerald
        strokeWidth: 2,
        strokeDasharray: '4 3',
        animated: false,
        label: 'routes subnet',
    },
    'main-route': {
        color: '#10b981',
        strokeWidth: 2.5,
        strokeDasharray: '',
        animated: false,
        label: 'main route',
    },
    'attached-to-subnet': {
        color: '#10b981',
        strokeWidth: 1.5,
        strokeDasharray: '3 3',
        animated: false,
        label: 'attached to subnet',
    },
    // ── Security / IAM ─────────────────────────────────────────────────────
    'has-security-group': {
        color: '#ef4444', // red
        strokeWidth: 1.5,
        strokeDasharray: '4 3',
        animated: false,
        label: 'security group',
    },
    'has-route-table': {
        color: '#10b981',
        strokeWidth: 1.5,
        strokeDasharray: '4 3',
        animated: false,
        label: 'route table',
    },
    'execution-role': {
        color: '#ec4899', // pink
        strokeWidth: 1.5,
        strokeDasharray: '3 3',
        animated: false,
        label: 'execution role',
    },
    'task-role': {
        color: '#ec4899',
        strokeWidth: 1.5,
        strokeDasharray: '3 3',
        animated: false,
        label: 'task role',
    },
    'service-role': {
        color: '#ec4899',
        strokeWidth: 1.5,
        strokeDasharray: '3 3',
        animated: false,
        label: 'service role',
    },
    // ── ECS ────────────────────────────────────────────────────────────────
    'runs-service': {
        color: '#a855f7', // violet
        strokeWidth: 2.5,
        strokeDasharray: '',
        animated: true,
        label: 'runs service',
    },
    'runs-in-subnet': {
        color: '#a855f7',
        strokeWidth: 2,
        strokeDasharray: '',
        animated: false,
        label: 'runs in subnet',
    },
    'uses-task-definition': {
        color: '#a855f7',
        strokeWidth: 1.5,
        strokeDasharray: '4 3',
        animated: false,
        label: 'task definition',
    },
    'has-listener': {
        color: '#f97316', // orange
        strokeWidth: 1.5,
        strokeDasharray: '3 3',
        animated: false,
        label: 'listener',
    },
};

const DEFAULT_EDGE_VISUAL: EdgeVisual = {
    color: 'var(--border)',
    strokeWidth: 1.5,
    strokeDasharray: '',
    animated: false,
    label: '',
};

function getEdgeVisual(relationship: string): EdgeVisual {
    const direct = EDGE_VISUALS[relationship];
    if (direct) return direct;

    if (relationship.startsWith('has-')) {
        return {
            color: '#64748b',
            strokeWidth: 1.5,
            strokeDasharray: '4 3',
            animated: false,
            label: relationship.replace(/^has-/, '').replace(/-/g, ' '),
        };
    }

    if (relationship.startsWith('contains')) {
        return {
            color: '#64748b',
            strokeWidth: 1.5,
            strokeDasharray: '5 4',
            animated: false,
            label: relationship.replace(/^contains[-]?/, '').replace(/-/g, ' ') || 'contains',
        };
    }

    return DEFAULT_EDGE_VISUAL;
}

export function normalizeEdges(edges: unknown): Edge[] {
    if (!Array.isArray(edges)) {
        return [];
    }

    return edges
        .filter((edge) => typeof edge === 'object' && edge !== null)
        .map((edge) => {
            const candidate = edge as Partial<Edge>;
            const relationship = (candidate.data?.relationship as string)?.toLowerCase() || '';
            const visual = getEdgeVisual(relationship);

            return {
                id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(),
                source: typeof candidate.source === 'string' ? candidate.source : '',
                target: typeof candidate.target === 'string' ? candidate.target : '',
                type: 'smoothstep',
                pathOptions: { borderRadius: 8 },
                animated: visual.animated || candidate.animated,
                data: candidate.data,
                interactionWidth: 16,
                zIndex: 0,
                style: {
                    stroke: visual.color,
                    strokeWidth: Math.min(visual.strokeWidth, 2),
                    strokeDasharray: visual.strokeDasharray || undefined,
                },
                markerEnd: {
                    type: 'arrowclosed' as const,
                    color: visual.color,
                    width: 14,
                    height: 14,
                },
            } as Edge;
        })
        .filter((edge) => edge.source.length > 0 && edge.target.length > 0);
}

function isHideableOrphanType(resourceType: string | undefined): boolean {
    const value = (resourceType ?? '').toLowerCase();

    if (matches(value, ['security group', 'network security group', 'task definition', 'managed identity'])) {
        return true;
    }

    return false;
}

function isAlwaysHiddenNodeType(resourceType: string | undefined): boolean {
    const value = (resourceType ?? '').toLowerCase();

    return value.includes('iam') && value.includes('role');
}

function shouldHideNodeByVisibilityFilter(resourceType: string | undefined, hiddenFilterIds: Set<ResourceVisibilityFilterId>): boolean {
    const value = (resourceType ?? '').toLowerCase();

    if (hiddenFilterIds.has('securityGroups') && matches(value, ['security group', 'network security group'])) {
        return true;
    }

    if (hiddenFilterIds.has('taskDefinitions') && value.includes('task definition')) {
        return true;
    }

    if (hiddenFilterIds.has('managedIdentities') && value.includes('managed identity')) {
        return true;
    }

    return false;
}

export function filterNodesByVisibility(nodes: Node[], hiddenFilterIds: Set<ResourceVisibilityFilterId>): Node[] {
    if (!nodes.length) {
        return [];
    }

    return nodes.filter((node) => {
        const data = (node.data ?? {}) as ArchitectureNodeData;

        if (isAlwaysHiddenNodeType(data.resourceType)) {
            return false;
        }

        return !shouldHideNodeByVisibilityFilter(data.resourceType, hiddenFilterIds);
    });
}

export function removeOrphanNodesByType(nodes: Node[], edges: Edge[]): Node[] {
    if (!nodes.length) {
        return [];
    }

    const degreeByNodeId = new Map<string, number>();

    for (const node of nodes) {
        degreeByNodeId.set(node.id, 0);
    }

    for (const edge of edges) {
        degreeByNodeId.set(edge.source, (degreeByNodeId.get(edge.source) ?? 0) + 1);
        degreeByNodeId.set(edge.target, (degreeByNodeId.get(edge.target) ?? 0) + 1);
    }

    return nodes.filter((node) => {
        const data = (node.data ?? {}) as ArchitectureNodeData;

        const degree = degreeByNodeId.get(node.id) ?? 0;

        if (degree > 0) {
            return true;
        }

        return !isHideableOrphanType(data.resourceType);
    });
}

export function normalizeAssessmentProvider(provider: string | null | undefined): AssessmentProvider {
    const normalized = (provider ?? '').trim().toLowerCase();

    if (normalized === 'aws' || normalized === 'azure' || normalized === 'gcp') {
        return normalized;
    }

    return 'unknown';
}

export function formatAssessmentProvider(provider: AssessmentProvider): string {
    if (provider === 'unknown') {
        return 'Cloud';
    }

    if (provider === 'gcp') {
        return 'GCP';
    }

    return provider.toUpperCase();
}
