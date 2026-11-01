import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {ROOT,PACKAGE,packageInfo,exists,fail,hashes,hash} from './common.mjs';
import {execute} from './command.mjs';
import {isDeepStrictEqual} from 'node:util';
const portableManifest=value=>{const out=structuredClone(value),normalize=p=>path.posix.normalize(p.replaceAll('\\','/'));if(Array.isArray(out.files))out.files=out.files.map(normalize).sort();if(out.bin&&typeof out.bin==='object')for(const k of Object.keys(out.bin))out.bin[k]=normalize(out.bin[k]);return out;};
export const sameManifestContract=(a,b)=>isDeepStrictEqual(portableManifest(a),portableManifest(b));
export async function materializeRuntime(stage){
 const runtime=path.join(stage,'.runtime');await fs.mkdir(runtime);
 const pkg=await packageInfo();
 for(const name of ['package.json',...pkg.files]){
  const from=path.resolve(ROOT,name);if(!from.startsWith(ROOT+path.sep)||name.includes('*'))fail('INVALID_PACKAGE_FILES','Expected owned concrete package files.');
  if(!await exists(from))continue;const to=path.join(runtime,name);await fs.mkdir(path.dirname(to),{recursive:true});
  await fs.cp(from,to,{recursive:true,filter:p=>!['node_modules','.runtime'].includes(path.basename(p))});
 }
 try{execute('npm',['install','--prefix',runtime,'--no-save','--ignore-scripts','--omit=dev','--no-audit','--no-fund','--prefer-offline','--dry-run=false','--json=false']);}
 catch(error){error.code='RUNTIME_INSTALL_FAILED';throw error;}
 // npm may rewrite package.json formatting on a platform. Preserve canonical bytes
 // only after verifying its parsed manifest is unchanged.
 const original=await fs.readFile(path.join(ROOT,'package.json')),installed=await fs.readFile(path.join(runtime,'package.json'));
 if(!original.equals(installed)){if(!sameManifestContract(JSON.parse(original),JSON.parse(installed))){const a=portableManifest(JSON.parse(original)),b=portableManifest(JSON.parse(installed)),fields=Object.keys({...a,...b}).filter(k=>!isDeepStrictEqual(a[k],b[k]));fail('RUNTIME_MANIFEST_CHANGED','npm changed package manifest fields: '+fields.join(', '));}await fs.writeFile(path.join(runtime,'package.json'),original);}
 // Runtime dependencies are private to this target. npm's generated command
 // shims are not used by this runtime; omit their links from the physical copy.
 await fs.rm(path.join(runtime,'node_modules','.bin'),{recursive:true,force:true});
 if(!await verifyRuntime(stage,pkg.version))fail('RUNTIME_VERIFY_FAILED','Isolated runtime failed dependency/version verification.');
 return {entry:'.runtime/bin/product-reference-replacement.mjs',version:pkg.version};
}
export async function verifyRuntime(target,version){
 try{
  const runtime=path.join(target,'.runtime');if((await fs.lstat(runtime)).isSymbolicLink())return false;
  const p=JSON.parse(await fs.readFile(path.join(runtime,'package.json'),'utf8'));
  const inner=JSON.parse(await fs.readFile(path.join(runtime,'skills/product-reference-replacement/package.json'),'utf8'));
  if(p.name!==PACKAGE||p.version!==version||inner.version!==version)return false;
  const baseline=JSON.parse(await fs.readFile(path.join(runtime,'skill-integrity.json'),'utf8'));const actual=await hashes(path.join(runtime,'skills/product-reference-replacement'));
  if(Object.keys({...baseline,...actual}).some(k=>baseline[k]!==actual[k]))return false;
  const entry=path.join(runtime,'bin/product-reference-replacement.mjs');if(!(await fs.realpath(entry)).startsWith(await fs.realpath(runtime)+path.sep))return false;
  const q=spawnSync(process.execPath,['--input-type=module','-e',"import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';const r=createRequire(process.argv[1]);const resolved=fs.realpathSync(r.resolve('sharp'));if(!resolved.startsWith(fs.realpathSync(path.dirname(process.argv[1]))+path.sep))process.exit(1);r('sharp');",path.join(runtime,'package.json')],{encoding:'utf8',timeout:10000,windowsHide:true});
  return q.status===0;
 }catch{return false;}
}

export async function runtimeSourceDifferences(receipt){
 if(!receipt)return ['<runtime-receipt-missing>'];const pkg=await packageInfo(),names=['package.json',...pkg.files],expected={};
 for(const name of names){const from=path.resolve(ROOT,name);if(!from.startsWith(ROOT+path.sep)||name.includes('*'))fail('INVALID_PACKAGE_FILES','Expected owned concrete package files.');const stat=await exists(from);if(!stat)continue;if(stat.isSymbolicLink())fail('UNSAFE_LINK',from);if(stat.isDirectory()){for(const [rel,h] of Object.entries(await hashes(from)))expected[name+'/'+rel]=h;}else expected[name]=hash(await fs.readFile(from));}
 const actual=Object.fromEntries(Object.entries(receipt).filter(([k])=>names.some(n=>k===n||k.startsWith(n+'/'))));
 return Object.keys({...actual,...expected}).filter(k=>actual[k]!==expected[k]);
}

export async function runtimeReceiptMatchesSource(receipt){return (await runtimeSourceDifferences(receipt)).length===0;}
