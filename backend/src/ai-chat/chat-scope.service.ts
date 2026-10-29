import { Injectable } from '@nestjs/common';
import { ErrorMessages } from '../common/messages/error-messages';

const OFF_TOPIC_PATTERNS: RegExp[] = [
    /\b(not[ií]cias|news|weather|clima|futebol|football|receita de|recipe|namoro|dating)\b/i,
    /\b(escreva (um )?poema|write (a )?poem|conte uma piada|tell (me )?a joke)\b/i,
    /\b(programa(r|ção)? (em )?(python|java|c\+\+|javascript) (do zero|from scratch))\b/i,
    /\b(pre[cç]o (do|da) (bitcoin|btc|ethereum)|stock market|bolsa de valores)\b/i,
];

const SECURITY_BYPASS_PATTERNS: RegExp[] = [
    /\b(ignore (all |previous )?instructions|ignore as (suas )?regras|jailbreak)\b/i,
    /\b(reveal|revele|mostre|show).{0,40}(system prompt|prompt (de )?sistema|instru[cç][oõ]es internas)\b/i,
    /\b(api[_ ]?key|secret[_ ]?key|credentials?|credenciais|password|senha|private[_ ]?key)\b/i,
    /\b(outra organiza[cç][aã]o|other organization|outro tenant|another tenant)\b/i,
];

const IN_SCOPE_HINTS: RegExp[] = [
    /\b(finops|custo|cost|billing|or[cç]amento|budget|anomalia|forecast)\b/i,
    /\b(assessment|invent[aá]rio|inventory|recurso|resource|aws|azure|gcp|cloud)\b/i,
    /\b(governan[cç]a|governance|compliance|pol[ií]tica|finding|viola[cç][aã]o)\b/i,
    /\b(automa[cç][aã]o|automation|workflow|execu[cç][aã]o|run)\b/i,
    /\b(conta cloud|cloud account|organiza[cç][aã]o|tenant|m[oó]dulo|saas|como (uso|utilizo|configuro))\b/i,
];

/** Phatic greetings — answer without tools or page links. */
const GREETING_PATTERN =
    /^(ol[áa]|oi+|hey+|hi+|hello|bom dia|boa tarde|boa noite|e a[ií]|tudo bem|tudo bom|salve)(\s+tudo bem)?[\s!.?🤔👋]*$/i;

const GREETING_REPLY =
    'Olá! Posso ajudar com custos (FinOps), inventário cloud, assessment, governança e automações da sua organização. Em que posso ajudar?';

export type ScopeDecision =
    | { allowed: true; reason: 'in_scope' | 'ambiguous' }
    | { allowed: true; reason: 'greeting'; message: string }
    | { allowed: false; reason: 'off_topic' | 'security'; message: string };

@Injectable()
export class ChatScopeService {
    evaluate(content: string): ScopeDecision {
        const text = content.trim();
        if (!text) {
            return {
                allowed: false,
                reason: 'off_topic',
                message: ErrorMessages.AI_CHAT.OUT_OF_SCOPE,
            };
        }

        if (GREETING_PATTERN.test(text)) {
            return { allowed: true, reason: 'greeting', message: GREETING_REPLY };
        }

        if (SECURITY_BYPASS_PATTERNS.some((pattern) => pattern.test(text))) {
            return {
                allowed: false,
                reason: 'security',
                message:
                    'Não posso revelar credenciais, prompts internos ou dados de outras organizações. Posso ajudar com dados autorizados da sua organização e funcionalidades do SaaS.',
            };
        }

        if (OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(text))) {
            const hasInScope = IN_SCOPE_HINTS.some((pattern) => pattern.test(text));
            if (!hasInScope) {
                return {
                    allowed: false,
                    reason: 'off_topic',
                    message: ErrorMessages.AI_CHAT.OUT_OF_SCOPE,
                };
            }
        }

        if (IN_SCOPE_HINTS.some((pattern) => pattern.test(text))) {
            return { allowed: true, reason: 'in_scope' };
        }

        // Ambiguous questions go to the model with tools restricted by backend policy.
        return { allowed: true, reason: 'ambiguous' };
    }
}
