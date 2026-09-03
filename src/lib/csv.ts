/**
 * CSV, both directions.
 *
 * Hand-written rather than a dependency, because the requirements are narrow
 * and specific: it has to survive quoted fields containing commas and newlines,
 * doubled quotes, CRLF from Windows Excel, a UTF-8 BOM, and Urdu text. A
 * general parser brings a lot of surface area for that.
 */

/** Parses a whole CSV document into rows of strings. Never throws on ragged rows. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, ''); // Excel writes a BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    // A trailing newline should not produce a final empty row.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === '') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      pushField();
      index += 1;
      continue;
    }
    if (char === '\r') {
      index += 1;
      continue;
    }
    if (char === '\n') {
      pushRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

/**
 * Serialises rows to a CSV document.
 *
 * A BOM is prepended: without it Excel on Windows renders Urdu product names as
 * mojibake, and the whole point of the CSV export is handing a file to someone
 * who will open it in Excel.
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const body = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  return `\uFEFF${body}\r\n`;
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  // A leading =, +, - or @ makes Excel treat the cell as a formula. Product
  // names do not usually start that way, but "-" as a placeholder does.
  if (/^[=+\-@]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Splits a parsed document into its header row and its data rows. */
export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export function readTable(input: string): CsvTable {
  const rows = parseCsv(input);
  if (rows.length === 0) return { headers: [], rows: [] };
  const [headers, ...rest] = rows;
  return { headers: (headers ?? []).map((header) => header.trim()), rows: rest };
}

/**
 * Guesses which column is which, so the shopkeeper usually only has to confirm
 * the mapping rather than build it. Matches English and Urdu headings.
 */
const HEADER_HINTS: Record<string, readonly string[]> = {
  nameEn: ['name', 'name_en', 'english', 'product', 'item', 'title', 'description'],
  nameUr: ['name_ur', 'urdu', 'نام', 'اردو'],
  sku: ['sku', 'code', 'item code', 'کوڈ'],
  barcode: ['barcode', 'ean', 'upc', 'بار کوڈ'],
  category: ['category', 'group', 'type', 'قسم'],
  unit: ['unit', 'uom', 'یونٹ'],
  price: ['price', 'sale price', 'selling price', 'rate', 'mrp', 'ریٹ', 'قیمت'],
  cost: ['cost', 'purchase price', 'buy price', 'لاگت'],
  stock: ['stock', 'qty', 'quantity', 'opening', 'on hand', 'مقدار', 'مال'],
  lowStock: ['low', 'reorder', 'min', 'threshold'],
};

export type ProductField = keyof typeof HEADER_HINTS;

export const PRODUCT_FIELDS = Object.keys(HEADER_HINTS) as ProductField[];

/**
 * Best-guess column index for each product field, or -1 when nothing matched.
 *
 * Two passes, and the order matters. Every field gets its shot at an exact
 * heading match before any field is allowed a substring match — otherwise
 * `sku`'s "code" hint claims a column headed "barcode" before `barcode` ever
 * gets to ask for it. One field per column, and one column per field.
 */
export function guessMapping(headers: string[]): Record<ProductField, number> {
  const normalised = headers.map((header) => header.trim().toLowerCase());
  const mapping = {} as Record<ProductField, number>;
  const taken = new Set<number>();

  for (const field of PRODUCT_FIELDS) mapping[field] = -1;

  const claim = (field: ProductField, matches: (header: string) => boolean): void => {
    if (mapping[field] !== -1) return;
    const found = normalised.findIndex((header, index) => !taken.has(index) && matches(header));
    if (found === -1) return;
    mapping[field] = found;
    taken.add(found);
  };

  for (const field of PRODUCT_FIELDS) {
    for (const hint of HEADER_HINTS[field]!) claim(field, (header) => header === hint);
  }
  for (const field of PRODUCT_FIELDS) {
    for (const hint of HEADER_HINTS[field]!) claim(field, (header) => header.includes(hint));
  }

  return mapping;
}
