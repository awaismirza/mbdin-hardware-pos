import { describe, expect, it } from 'vitest';

import { guessMapping, parseCsv, readTable, toCsv } from './csv';

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('name,price\n"Ghee, 1kg",720')).toEqual([
      ['name', 'price'],
      ['Ghee, 1kg', '720'],
    ]);
  });

  it('handles doubled quotes inside a quoted field', () => {
    expect(parseCsv('a\n"He said ""hello"""')).toEqual([['a'], ['He said "hello"']]);
  });

  it('handles newlines inside a quoted field', () => {
    expect(parseCsv('a,b\n"line one\nline two",2')).toEqual([
      ['a', 'b'],
      ['line one\nline two', '2'],
    ]);
  });

  it('handles CRLF from Windows Excel', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a UTF-8 BOM', () => {
    expect(parseCsv('﻿name\nچینی')).toEqual([['name'], ['چینی']]);
  });

  it('keeps Urdu text intact', () => {
    const rows = parseCsv('نام,ریٹ\nڈالڈا گھی,720\n"چینی، سفید",170');
    expect(rows[1]).toEqual(['ڈالڈا گھی', '720']);
    expect(rows[2]).toEqual(['چینی، سفید', '170']);
  });

  it('keeps empty fields rather than dropping them', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('ignores a trailing newline', () => {
    expect(parseCsv('a\n1\n')).toEqual([['a'], ['1']]);
  });

  it('returns nothing for an empty document', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('toCsv', () => {
  it('quotes what needs quoting and leaves the rest alone', () => {
    const text = toCsv([
      ['name', 'note'],
      ['Sugar', 'plain'],
      ['Ghee, 1kg', 'has "quotes"'],
    ]);
    expect(text).toContain('Sugar,plain');
    expect(text).toContain('"Ghee, 1kg","has ""quotes"""');
  });

  it('starts with a BOM so Excel renders Urdu correctly', () => {
    expect(toCsv([['چینی']]).startsWith('﻿')).toBe(true);
  });

  it('quotes a value Excel would treat as a formula', () => {
    expect(toCsv([['-5']])).toContain('"-5"');
    expect(toCsv([['=SUM(A1)']])).toContain('"=SUM(A1)"');
  });

  it('round-trips through the parser', () => {
    const rows = [
      ['name', 'price', 'note'],
      ['چینی, سفید', '170', 'line\nbreak'],
    ];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed).toEqual(rows);
  });

  it('writes empty cells for null and undefined', () => {
    expect(toCsv([[null, undefined, 0]])).toContain(',,0');
  });
});

describe('readTable', () => {
  it('splits headers from rows and trims the headers', () => {
    const table = readTable(' name , price \nSugar,170');
    expect(table.headers).toEqual(['name', 'price']);
    expect(table.rows).toEqual([['Sugar', '170']]);
  });
});

describe('guessMapping', () => {
  it('finds obvious columns', () => {
    const mapping = guessMapping(['Name', 'Barcode', 'Price', 'Stock']);
    expect(mapping.nameEn).toBe(0);
    expect(mapping.barcode).toBe(1);
    expect(mapping.price).toBe(2);
    expect(mapping.stock).toBe(3);
  });

  it('does not let cost swallow the price column', () => {
    const mapping = guessMapping(['Item', 'Cost', 'Price']);
    expect(mapping.cost).toBe(1);
    expect(mapping.price).toBe(2);
  });

  it('recognises Urdu headings', () => {
    const mapping = guessMapping(['نام', 'ریٹ', 'مقدار']);
    expect(mapping.nameUr).toBe(0);
    expect(mapping.price).toBe(1);
    expect(mapping.stock).toBe(2);
  });

  it('reports -1 for anything it cannot place', () => {
    expect(guessMapping(['alpha', 'beta']).price).toBe(-1);
  });

  it('never maps two fields to the same column', () => {
    const mapping = guessMapping(['name', 'name_ur']);
    expect(mapping.nameEn).not.toBe(mapping.nameUr);
  });
});
