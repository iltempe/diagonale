import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
let generator: () => string = customAlphabet(alphabet, 10);

/** Generate a new entity id (nanoid). */
export function newId(prefix = ''): string {
  return prefix + generator();
}

/** Replace the id generator (used by tests for deterministic output). */
export function setIdGenerator(gen: () => string): void {
  generator = gen;
}

/** Deterministic counter-based generator, handy in tests. */
export function sequentialIds(start = 1): () => string {
  let n = start;
  return () => `id${n++}`;
}
