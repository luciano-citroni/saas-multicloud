import type { Edge, Node } from '@xyflow/react';

export type AssessmentGraphPayload = {
    architectureGraph?: {
        nodes?: Node[];
        edges?: Edge[];
    };
};

export type SidebarContextOrganization = {
    id: string;
    plans?: string[] | unknown;
    currentRole?: string | null;
};

export type SidebarContextPayload = {
    organizations?: SidebarContextOrganization[];
};

export type ArchitectureNodeData = {
    label?: string;
    resourceType?: string;
    status?: string;
    details?: Record<string, unknown>;
    group?: {
        vpcId?: string;
        vpcName?: string;
        region?: string;
    };
};

export type GroupNodeData = {
    label: string;
};

export type GroupingMode = 'resourceType' | 'vpc' | 'region' | 'none';
export type AssessmentProvider = 'aws' | 'azure' | 'gcp' | 'unknown';
export type ResourceVisibilityFilterId = 'securityGroups' | 'taskDefinitions' | 'managedIdentities';
