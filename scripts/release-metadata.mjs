import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
export async function releaseMetadata(root,{write=false}={}){
 const outer=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const skill=path.join(root,'skills/product-reference-replacement'),file=path.join(skill,'package.json');
 const inner=JSON.parse(await fs.readFile(file,'utf8'));
 if(inner.name!==outer.name)throw Error('RELEASE_NAME_MISMATCH');
 if(write){await fs.stat(file);inner.version=outer.version;await fs.writeFile(file,JSON.stringify(inner,null,2)+'\n');}
 if(inner.version!==outer.version)throw Error(`RELEASE_VERSION_MISMATCH: package=${outer.version}, skill=${inner.version}`);
 const hashes={};async function walk(dir,base=''){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(['node_modules','package-lock.json','.npmignore'].includes(e.name))continue;if(e.isSymbolicLink())throw Error('RELEASE_SOURCE_LINK');const rel=base?base+'/'+e.name:e.name;const p=path.join(dir,e.name);if(e.isDirectory())await walk(p,rel);else hashes[rel]=createHash('sha256').update(await fs.readFile(p)).digest('hex');}}
 await walk(skill);const manifest=path.join(root,'skill-integrity.json');
 if(write){await fs.stat(manifest);await fs.writeFile(manifest,JSON.stringify(hashes,null,2)+'\n');}
 const expected=JSON.parse(await fs.readFile(manifest,'utf8'));
 if(Object.keys({...expected,...hashes}).some(k=>expected[k]!==hashes[k]))throw Error('RELEASE_SKILL_INTEGRITY_MISMATCH');
 return {ok:true,version:outer.version,skill_version:inner.version,files:Object.keys(hashes).length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await releaseMetadata(path.resolve(import.meta.dirname,'..'),{write:process.argv.includes('--write')});if(!process.argv.includes('--quiet'))console.log(JSON.stringify(result));}catch(e){console.error(e.message);process.exitCode=1;}
}
