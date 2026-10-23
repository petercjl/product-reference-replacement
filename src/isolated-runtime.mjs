import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {ROOT,PACKAGE,packageInfo,exists,fail,hashes} from './common.mjs';
export async function materializeRuntime(stage){
 const runtime=path.join(stage,'.runtime');await fs.mkdir(runtime);
 const pkg=await packageInfo();
 for(const name of ['package.json',...pkg.files]){
  const from=path.resolve(ROOT,name);if(!from.startsWith(ROOT+path.sep)||name.includes('*'))fail('INVALID_PACKAGE_FILES','Expected owned concrete package files.');
  if(!await exists(from))continue;const to=path.join(runtime,name);await fs.mkdir(path.dirname(to),{recursive:true});
  await fs.cp(from,to,{recursive:true,filter:p=>!['node_modules','.runtime'].includes(path.basename(p))});
 }
 const result=spawnSync('npm',['install','--prefix',runtime,'--ignore-scripts','--omit=dev','--no-audit','--no-fund','--prefer-offline'],{encoding:'utf8',timeout:180000,windowsHide:true,shell:process.platform==='win32',env:{...process.env,npm_config_dry_run:'false',npm_config_json:'false'}});
 if(result.status!==0)fail('RUNTIME_INSTALL_FAILED','Target-owned runtime dependencies failed to install; old Skill preserved.');
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
