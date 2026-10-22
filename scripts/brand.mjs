#!/usr/bin/env node
/**
 * Writes the logo and favicon files in `public/` from src/lib/brand.ts.
 *
 *   npm run brand
 *
 * Run it after changing the mark or a palette, and commit what it writes:
 * src/lib/brand.spec.ts fails while a committed file differs from it.
 * Node loads the TypeScript source directly (type stripping, Node 22.18+).
 */
import { writeFile } from 'node:fs/promises';
import { brandFiles } from '../src/lib/brand.ts';

const publicDir = new URL('../public/', import.meta.url);

for (const [name, svg] of Object.entries(brandFiles())) {
  await writeFile(new URL(name, publicDir), svg);
  console.log(`wrote public/${name}`);
}
