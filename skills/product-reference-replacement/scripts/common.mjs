import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const ROOT=path.resolve(import.meta.dirname,'..');
export const hash=data=>createHash('sha256').update(data).digest('hex');
export function check(ok,code,message){if(!ok)throw Object.assign(new Error(message),{code});}
export async function exists(p){try{return await fs.lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function read(p){return JSON.parse(await fs.readFile(p,'utf8'));}
export async function writeNew(p,data){check(!await exists(p),'OUTPUT_EXISTS',`Preserving existing file: ${p}`);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2)+'\n',{flag:'wx'});}
export async function freshDir(p){check(!await exists(p),'OUTPUT_EXISTS',`Preserving existing directory: ${p}`);await fs.mkdir(p,{recursive:false});}
export async function identity(p){const s=await fs.stat(p);check(s.isFile()&&s.size>0,'INVALID_IMAGE','Expected a nonempty local file.');return {path:path.resolve(p),bytes:s.size,sha256:hash(await fs.readFile(p))};}
export async function unchanged(ref){const actual=await identity(ref.path);check(actual.sha256===ref.sha256,'REFERENCE_CHANGED',`Reference content changed: ${ref.path}`);return actual;}
export const resolve=(base,p)=>{check(typeof p==='string'&&p.length>0,'INVALID_INPUT','A local path is required.');return path.resolve(base,p);};
export const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export function knownFields(value,allowed){check(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_INPUT','Expected a JSON object.');for(const k of Object.keys(value))check(allowed.includes(k),'UNKNOWN_FIELD',`Unsupported JSON field: ${k}`);}
export const safeId=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
export const escapeText=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export async function locked(dir,fn){const p=path.join(dir,'.operation-lock');let h;try{h=await fs.open(p,'wx');}catch(e){if(e.code==='EEXIST')check(false,'LOCKED','Another operation owns this job lock. Inspect it before manual recovery.');throw e;}try{await h.writeFile(JSON.stringify({id:randomUUID(),pid:process.pid}));return await fn();}finally{await h.close();await fs.unlink(p);}}
