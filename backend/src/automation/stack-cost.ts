const HOURS_PER_MONTH = 730;
const FARGATE_VCPU_HOUR_USD = 0.04048;
const FARGATE_GB_HOUR_USD = 0.004445;
const ALB_HOUR_USD = 0.0225;
const PUBLIC_IPV4_HOUR_USD = 0.005;

function numberFrom(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
}

export function estimateStackMonthlyCost(
    resources: Array<{ type: string }>,
    parameters: Record<string, unknown>,
): number | null {
    const hasService = resources.some((resource) => resource.type === 'AWS::ECS::Service' || resource.type === 'AWS::ECS::TaskDefinition');
    if (!hasService) return null;

    const cpu = numberFrom(parameters.Cpu);
    const memory = numberFrom(parameters.Memory);
    const count = numberFrom(parameters.DesiredCount);
    if (cpu == null || memory == null || count == null) return null;

    const vcpu = cpu / 1024;
    const memoryGb = memory / 1024;
    let monthly = (vcpu * FARGATE_VCPU_HOUR_USD + memoryGb * FARGATE_GB_HOUR_USD) * HOURS_PER_MONTH * count;

    const hasLoadBalancer = resources.some((resource) => resource.type === 'AWS::ElasticLoadBalancingV2::LoadBalancer');
    if (hasLoadBalancer && parameters.CreateLoadBalancer !== 'false' && parameters.CreateLoadBalancer !== false) {
        monthly += ALB_HOUR_USD * HOURS_PER_MONTH;
    }

    if (parameters.AssignPublicIp === 'ENABLED') {
        monthly += PUBLIC_IPV4_HOUR_USD * HOURS_PER_MONTH * count;
    }

    return parseFloat(monthly.toFixed(4));
}
