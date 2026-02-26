import { z } from 'zod';

/**
 * Validador de CPF
 * - Valida o formato (11 dígitos numéricos)
 * - Valida o algoritmo do CPF (dígitos verificadores)
 */
export const cpfValidator = z
    .string()
    .length(11, 'CPF must contain exactly 11 digits')
    .regex(/^\d+$/, 'CPF must contain only numbers')
    .refine((cpf) => validateCPFAlgorithm(cpf), 'Invalid CPF provided');

function validateCPFAlgorithm(cpf: string): boolean {
    // CPF com todos os dígitos iguais é inválido
    if (/^(\d)\1{10}$/.test(cpf)) {
        return false;
    }

    // Validar primeiro dígito verificador
    let sum = 0;
    let multiplier = 10;

    for (let i = 0; i < 9; i++) {
        sum += parseInt(cpf.charAt(i), 10) * multiplier;
        multiplier--;
    }

    let remainder = sum % 11;
    let firstDigit = remainder < 2 ? 0 : 11 - remainder;

    if (firstDigit !== parseInt(cpf.charAt(9), 10)) {
        return false;
    }

    // Validar segundo dígito verificador
    sum = 0;
    multiplier = 11;

    for (let i = 0; i < 10; i++) {
        sum += parseInt(cpf.charAt(i), 10) * multiplier;
        multiplier--;
    }

    remainder = sum % 11;
    let secondDigit = remainder < 2 ? 0 : 11 - remainder;

    if (secondDigit !== parseInt(cpf.charAt(10), 10)) {
        return false;
    }

    return true;
}
