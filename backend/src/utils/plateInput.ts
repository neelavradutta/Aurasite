/** Matches DB plate_number column (STRING(20)). */
export const MAX_PLATE_INPUT_LENGTH = 20;

export function boundPlateInput(value: unknown): string {
  return String(value ?? '').trim().slice(0, MAX_PLATE_INPUT_LENGTH);
}
