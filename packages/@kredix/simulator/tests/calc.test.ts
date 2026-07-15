import { describe, it, expect } from 'vitest';
import { calculateLoan, roundToDurationStep, formatFrenchNumber } from '../src';

describe('calculateLoan', () => {
  it('calcule correctement un prêt immobilier standard (150k, 20 ans)', () => {
    const result = calculateLoan({
      loanType: 'immo',
      amount: 150_000,
      durationYears: 20,
    });
    // 150k < 200k mais >= 100k → taux 2.5%
    expect(result.annualRate).toBe(2.5);
    expect(result.monthlyPayment).toBeGreaterThan(700);
    expect(result.monthlyPayment).toBeLessThan(800);
    expect(result.totalMonths).toBe(240);
  });

  it('applique le taux 2% pour les montants >= 200 000 €', () => {
    const result = calculateLoan({
      loanType: 'immo',
      amount: 250_000,
      durationYears: 25,
    });
    expect(result.annualRate).toBe(2.0);
  });

  it('applique le taux 2.5% pour les montants entre 100k et 200k', () => {
    const result = calculateLoan({
      loanType: 'conso',
      amount: 120_000,
      durationYears: 15,
    });
    expect(result.annualRate).toBe(2.5);
  });

  it('applique le taux de base du type pour les montants < 100k', () => {
    const result = calculateLoan({
      loanType: 'conso',
      amount: 20_000,
      durationYears: 5,
    });
    expect(result.annualRate).toBe(5.9); // taux de base conso
  });

  it('lève une erreur pour un montant négatif', () => {
    expect(() =>
      calculateLoan({ loanType: 'immo', amount: -1000, durationYears: 10 })
    ).toThrow();
  });
});

describe('roundToDurationStep', () => {
  const steps = [5, 10, 15, 20, 25, 30];

  it('arrondit au palier le plus proche', () => {
    expect(roundToDurationStep(7, steps)).toBe(5);
    expect(roundToDurationStep(12, steps)).toBe(10);
    expect(roundToDurationStep(18, steps)).toBe(20);
    expect(roundToDurationStep(23, steps)).toBe(25);
  });
});

describe('formatFrenchNumber', () => {
  it('formate avec des espaces comme séparateurs de milliers', () => {
    expect(formatFrenchNumber(150000)).toBe('150 000');
    expect(formatFrenchNumber(5000)).toBe('5 000');
    expect(formatFrenchNumber(712)).toBe('712');
  });
});
