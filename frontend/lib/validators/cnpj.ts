export function isValidCNPJ(input: string): boolean {
    if (!input) return false;
    const cnpj = input.replace(/\D/g, '');
    if (cnpj.length !== 14) return false;
    // rejeita sequências iguais
    if (/^(\d)\1{13}$/.test(cnpj)) return false;

    const calcCheckDigit = (cnpjSlice: string, factors: number[]) => {
        const sum = cnpjSlice
            .split('')
            .map(Number)
            .reduce((acc, num, idx) => acc + num * factors[idx], 0);
        const rem = sum % 11;
        return rem < 2 ? 0 : 11 - rem;
    };

    const base12 = cnpj.slice(0, 12);
    const factors1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const firstDigit = calcCheckDigit(base12, factors1);

    const base13 = base12 + String(firstDigit);
    const factors2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const secondDigit = calcCheckDigit(base13, factors2);

    return cnpj === base13 + String(secondDigit);
}

export function formatCNPJ(input: string): string {
    const digits = (input || '').replace(/\D/g, '').padStart(14, '0');
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export default isValidCNPJ;
