import { parseUsdBrlQuote } from './usd-brl-quote';

describe('parseUsdBrlQuote', () => {
    it('reads the bid and the daily change from AwesomeAPI', () => {
        expect(
            parseUsdBrlQuote({
                USDBRL: { bid: '5.4321', pctChange: '-0.15', create_date: '2026-11-06 10:30:00' },
            }),
        ).toEqual({
            bid: 5.4321,
            pctChange: -0.15,
            quotedAt: '2026-11-06 10:30:00',
        });
    });

    it('rejects a payload without a positive bid', () => {
        expect(parseUsdBrlQuote({ USDBRL: { bid: '0' } })).toBeNull();
        expect(parseUsdBrlQuote({})).toBeNull();
    });
});
