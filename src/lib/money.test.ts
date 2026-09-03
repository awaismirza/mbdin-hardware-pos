import { describe, expect, it } from 'vitest';

import {
  clampDiscount,
  formatPKR,
  formatQty,
  lineTotal,
  marginPercent,
  paisaToRupeeString,
  parsePaisa,
  percentOf,
  roundQty,
  roundToPaisa,
  sumPaisa,
} from './money';

describe('parsePaisa', () => {
  it('reads whole rupees', () => {
    expect(parsePaisa('250')).toBe(25000);
    expect(parsePaisa('0')).toBe(0);
    expect(parsePaisa('1')).toBe(100);
  });

  it('reads decimals as paisa', () => {
    expect(parsePaisa('250.50')).toBe(25050);
    expect(parsePaisa('250.5')).toBe(25050);
    expect(parsePaisa('0.01')).toBe(1);
    expect(parsePaisa('33.33')).toBe(3333);
  });

  it('survives the float that trips naive parsers', () => {
    // 1.15 * 100 is 114.99999999999999 in IEEE 754.
    expect(parsePaisa('1.15')).toBe(115);
    expect(parsePaisa('8.20')).toBe(820);
    expect(parsePaisa('1.005')).toBe(101);
    expect(parsePaisa('117.30')).toBe(11730);
  });

  it('tolerates the way a person types', () => {
    expect(parsePaisa(' 1,250.75 ')).toBe(125075);
    expect(parsePaisa('١٢٣')).toBe(12300); // Arabic-Indic digits
    expect(parsePaisa('۴۵')).toBe(4500); // Extended Arabic-Indic
    expect(parsePaisa('-40')).toBe(-4000);
  });

  it('refuses what is not a number', () => {
    expect(parsePaisa('')).toBeNull();
    expect(parsePaisa('abc')).toBeNull();
    expect(parsePaisa('1.2.3')).toBeNull();
    expect(parsePaisa('.')).toBeNull();
    expect(parsePaisa('-')).toBeNull();
    expect(parsePaisa(null)).toBeNull();
    expect(parsePaisa(undefined)).toBeNull();
  });

  it('accepts an amount a shop could plausibly ring up', () => {
    expect(parsePaisa('999999')).toBe(99999900);
  });

  it('refuses an amount past the Rs 10 crore ceiling', () => {
    expect(parsePaisa('100000001')).toBeNull();
    expect(parsePaisa('-100000001')).toBeNull();
  });
});

describe('formatPKR', () => {
  it('shows no decimals when the value is whole', () => {
    expect(formatPKR(106000)).toBe('Rs 1,060');
    expect(formatPKR(0)).toBe('Rs 0');
    expect(formatPKR(17000)).toBe('Rs 170');
  });

  it('shows two decimals when there are paisa', () => {
    expect(formatPKR(9999)).toBe('Rs 99.99');
    expect(formatPKR(25050)).toBe('Rs 250.50');
    expect(formatPKR(1)).toBe('Rs 0.01');
  });

  it('groups in threes', () => {
    expect(formatPKR(100000000)).toBe('Rs 1,000,000');
    expect(formatPKR(99900)).toBe('Rs 999');
    expect(formatPKR(100000)).toBe('Rs 1,000');
  });

  it('handles negatives, signs and the symbol switch', () => {
    expect(formatPKR(-25050)).toBe('-Rs 250.50');
    expect(formatPKR(5000, { signed: true })).toBe('+Rs 50');
    expect(formatPKR(5000, { symbol: false })).toBe('50');
    expect(formatPKR(5000, { forceDecimals: true })).toBe('Rs 50.00');
  });
});

describe('the arithmetic a till actually does', () => {
  it('totals three items at Rs 33.33 to exactly Rs 99.99', () => {
    const unit = parsePaisa('33.33');
    expect(unit).toBe(3333);
    const total = lineTotal(unit!, 3);
    expect(total).toBe(9999);
    expect(formatPKR(total)).toBe('Rs 99.99');
  });

  it('totals a cart of three separate Rs 33.33 lines the same way', () => {
    const lines = [lineTotal(3333, 1), lineTotal(3333, 1), lineTotal(3333, 1)];
    expect(sumPaisa(lines)).toBe(9999);
  });

  it('multiplies a weighed quantity without drift', () => {
    // 1.75 kg of sugar at Rs 170.00
    expect(lineTotal(17000, 1.75)).toBe(29750);
    // 0.25 kg of ghee at Rs 720.00
    expect(lineTotal(72000, 0.25)).toBe(18000);
    // A third of a kilo, which cannot be represented exactly
    expect(lineTotal(30000, 0.333)).toBe(9990);
  });

  it('rounds half away from zero, so the till reconciles', () => {
    expect(roundToPaisa(0.5)).toBe(1);
    expect(roundToPaisa(1.5)).toBe(2);
    expect(roundToPaisa(2.5)).toBe(3); // banker's rounding would give 2
    expect(roundToPaisa(-0.5)).toBe(-1);
    expect(roundToPaisa(-2.5)).toBe(-3);
  });

  it('takes a percentage the way a shopkeeper expects', () => {
    expect(percentOf(9999, 12.5)).toBe(1250);
    expect(percentOf(100000, 10)).toBe(10000);
    expect(percentOf(33333, 33.33)).toBe(11110);
    expect(percentOf(100000, 0)).toBe(0);
  });

  it('never lets a discount exceed the subtotal or go negative', () => {
    expect(clampDiscount(10000, 12000)).toBe(10000);
    expect(clampDiscount(10000, -500)).toBe(0);
    expect(clampDiscount(10000, 2500)).toBe(2500);
  });

  it('refuses a fractional paisa anywhere it would be stored', () => {
    expect(() => sumPaisa([100.5])).toThrow(/integer number of paisa/);
    expect(() => lineTotal(100.5, 2)).toThrow(/integer number of paisa/);
  });
});

describe('quantities', () => {
  it('keeps three decimal places for weighed goods', () => {
    expect(roundQty(1.2345)).toBe(1.235);
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(2)).toBe(2);
  });

  it('prints without trailing zeros', () => {
    expect(formatQty(2)).toBe('2');
    expect(formatQty(1.5)).toBe('1.5');
    expect(formatQty(1.25)).toBe('1.25');
    expect(formatQty(0.333)).toBe('0.333');
  });
});

describe('margin', () => {
  it('is a share of the selling price', () => {
    expect(marginPercent(8000, 10000)).toBe(20);
    expect(marginPercent(0, 10000)).toBe(100);
    expect(marginPercent(12000, 10000)).toBe(-20);
  });

  it('is undefined when the item is free', () => {
    expect(marginPercent(500, 0)).toBeNull();
  });
});

describe('paisaToRupeeString', () => {
  it('is the plain form used in CSV and WhatsApp text', () => {
    expect(paisaToRupeeString(25050)).toBe('250.50');
    expect(paisaToRupeeString(106000)).toBe('1060');
    expect(paisaToRupeeString(-1)).toBe('-0.01');
  });
});
