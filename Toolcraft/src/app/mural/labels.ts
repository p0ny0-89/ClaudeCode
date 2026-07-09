/**
 * Spreadsheet-style cell coordinates for the fabrication/install map:
 * columns become letters (A, B, ... Z, AA, AB), rows become 1-based numbers,
 * so a contractor reads tile A3 as column A, row 3.
 */
export function getColumnLabel(column: number): string {
  if (column < 0 || !Number.isFinite(column)) {
    return "";
  }

  let value = Math.floor(column);
  let label = "";

  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return label;
}

export function getCellLabel(row: number, column: number): string {
  return `${getColumnLabel(column)}${Math.floor(row) + 1}`;
}
