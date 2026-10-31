import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** ID curto, URL-safe, com prefixo por entidade (ex.: crs_7f3k…). */
export function newId(prefix: string, size = 16): string {
  const bytes = randomBytes(size);
  let out = '';
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return `${prefix}_${out}`;
}
