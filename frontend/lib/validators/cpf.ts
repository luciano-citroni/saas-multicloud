/**
 * Validar CPF seguindo o algoritmo padrão brasileiro
 * Remove caracteres especiais e valida os dígitos verificadores
 */
export const isValidCPF = (cpf: string): boolean => {
    // Remove caracteres que não são dígitos
    const cleanCPF = cpf.replace(/\D/g, '');

    // Verifica se tem exatamente 11 dígitos
    if (cleanCPF.length !== 11) {
        return false;
    }

    // Verifica se todos os dígitos são iguais (válido técnico mas improvável)
    if (/^(\d)\1{10}$/.test(cleanCPF)) {
        return false;
    }

    // Calcula o primeiro dígito verificador
    let sum = 0;
    let remainder;

    for (let i = 1; i <= 9; i++) {
        sum += parseInt(cleanCPF.substring(i - 1, i), 10) * (11 - i);
    }

    remainder = (sum * 10) % 11;

    if (remainder === 10 || remainder === 11) {
        remainder = 0;
    }

    if (remainder !== parseInt(cleanCPF.substring(9, 10), 10)) {
        return false;
    }

    // Calcula o segundo dígito verificador
    sum = 0;

    for (let i = 1; i <= 10; i++) {
        sum += parseInt(cleanCPF.substring(i - 1, i), 10) * (12 - i);
    }

    remainder = (sum * 10) % 11;

    if (remainder === 10 || remainder === 11) {
        remainder = 0;
    }

    if (remainder !== parseInt(cleanCPF.substring(10, 11), 10)) {
        return false;
    }

    return true;
};

/**
 * Formatar CPF para o padrão XXX.XXX.XXX-XX
 */
export const formatCPF = (cpf: string): string => {
    const cleanCPF = cpf.replace(/\D/g, '');

    if (cleanCPF.length <= 3) {
        return cleanCPF;
    }

    if (cleanCPF.length <= 6) {
        return `${cleanCPF.slice(0, 3)}.${cleanCPF.slice(3)}`;
    }

    if (cleanCPF.length <= 9) {
        return `${cleanCPF.slice(0, 3)}.${cleanCPF.slice(3, 6)}.${cleanCPF.slice(6)}`;
    }

    return `${cleanCPF.slice(0, 3)}.${cleanCPF.slice(3, 6)}.${cleanCPF.slice(6, 9)}-${cleanCPF.slice(9, 11)}`;
};
