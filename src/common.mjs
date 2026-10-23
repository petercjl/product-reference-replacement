import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const PACKAGE = '@petercjl/product-reference-replacement';
export const ROOT = path.resolve(import.meta.dirname, '..');
export const SOURCE = path.join(ROOT, 'skills', 'product-reference-replacement');
export function fail(code, message) { throw Object.assign(new Error(message), { code }); }
export async function exists(p) { try { return await fs.lstat(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
export const hash = b => createHash('sha256').update(b).digest('hex');
export async function readJSON(p) { return JSON.parse(await fs.readFile(p, 'utf8')); }
export async function writeNew(p, data) { if (await exists(p)) fail('OUTPUT_EXISTS', `Preserving existing path: ${p}`); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, data, { flag: 'wx' }); }
export async function hashes(dir) {
 const out = {};
 async function walk(base) { for (const e of await fs.readdir(path.join(dir, base), { withFileTypes: true })) { const rel = path.join(base, e.name); if (e.isSymbolicLink()) fail('UNSAFE_LINK', rel); if (['node_modules','.runtime','package-lock.json','.npmignore'].includes(e.name)) continue; if (e.isDirectory()) await walk(rel); else if (e.name !== '.product-reference-install.json') out[rel.replaceAll(path.sep, '/')] = hash(await fs.readFile(path.join(dir, rel))); } }
 await walk(''); return out;
}
export async function packageInfo() { return readJSON(path.join(ROOT, 'package.json')); }
