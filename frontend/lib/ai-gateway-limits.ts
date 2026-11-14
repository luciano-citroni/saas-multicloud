/**
 * Hard token/cost/RPM limits are only enforceable when traffic goes through
 * the AI Gateway. Today the gateway proxies OpenAI chat completions.
 */
const GATEWAY_TOKEN_LIMIT_PROVIDERS = new Set(['openai']);

export function supportsAiGatewayTokenLimits(providerSlug: string): boolean {
    return GATEWAY_TOKEN_LIMIT_PROVIDERS.has(providerSlug);
}
