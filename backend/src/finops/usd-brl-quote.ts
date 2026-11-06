const USD_BRL_URL = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';
const CACHE_MS = 10 * 60 * 1000;

export type UsdBrlQuote = {
    bid: number;
    pctChange: number | null;
    quotedAt: string | null;
};

type AwesomeUsdBrl = {
    USDBRL?: {
        bid?: string;
        pctChange?: string;
        create_date?: string;
    };
};

let cached: { at: number; quote: UsdBrlQuote } | null = null;

export function parseUsdBrlQuote(payload: unknown): UsdBrlQuote | null {
    const row = (payload as AwesomeUsdBrl | null)?.USDBRL;
    const bid = Number(row?.bid);
    if (!Number.isFinite(bid) || bid <= 0) return null;
    const pctChange = Number(row?.pctChange);
    return {
        bid,
        pctChange: Number.isFinite(pctChange) ? pctChange : null,
        quotedAt: row?.create_date?.trim() || null,
    };
}

export async function fetchUsdBrlQuote(fetchImpl: typeof fetch = fetch): Promise<UsdBrlQuote | null> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.quote;

    const response = await fetchImpl(USD_BRL_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
        throw new Error(`AwesomeAPI USD-BRL respondeu ${response.status}`);
    }
    const quote = parseUsdBrlQuote(await response.json());
    if (!quote) {
        throw new Error('AwesomeAPI USD-BRL sem cotação válida');
    }
    cached = { at: Date.now(), quote };
    return quote;
}
