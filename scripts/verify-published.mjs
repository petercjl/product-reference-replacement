import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'published-identity-'));
const env={...process.env,PRODUCT_REFERENCE_REPLACEMENT_UPDATE_CHECK:'0',npm_config_dry_run:'false',npm_config_json:'false'};
function run(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',env,timeout:180000,windowsHide:true,shell:process.platform==='win32'&&cmd==='npm'});if(r.status!==0)throw Error((r.stderr||r.stdout).slice(-2000));return r.stdout;}
try{
 let visible=false;for(let n=0;n<20;n++){try{const data=JSON.parse(run('npm',['view',pkg.name,'version','dist-tags','--json','--prefer-online']));if(data.version===pkg.version&&data['dist-tags']?.latest===pkg.version){visible=true;break;}}catch{}await new Promise(r=>setTimeout(r,15000));}
 assert.ok(visible,'Exact stable registry version/latest unavailable');
 const prefix=path.join(tmp,'bootstrap');run('npm',['install','--prefix',prefix,pkg.name+'@'+pkg.version,'--ignore-scripts','--prefer-online','--no-audit','--no-fund']);
 const root=path.join(prefix,'node_modules',...pkg.name.split('/'));const cli=path.join(root,'bin/product-reference-replacement.mjs');
 for(const name of ['package.json','skills/product-reference-replacement/package.json'])assert.equal(JSON.parse(await fs.readFile(path.join(root,name),'utf8')).version,pkg.version);
 assert.equal(JSON.parse(run(process.execPath,[cli,'skill','source','--json'])).version,pkg.version);
 const target=path.join(tmp,'host-a'),targetB=path.join(tmp,'host-b');
 for(const dir of [target,targetB]){const receipt=JSON.parse(run(process.execPath,[cli,'skill','install','--target-directory',dir,'--json']));assert.equal(receipt.version,pkg.version);assert.equal(receipt.mode,'copy');assert.equal((await fs.lstat(dir)).isSymbolicLink(),false);}
 const marker=JSON.parse(await fs.readFile(path.join(targetB,'.product-reference-install.json'),'utf8'));const entry=path.resolve(targetB,marker.runtime_entry);assert.equal(marker.runtime_version,pkg.version);
 await fs.rm(target,{recursive:true,force:true});await fs.rm(prefix,{recursive:true,force:true});
 assert.equal(JSON.parse(run(process.execPath,[entry,'version','--json'])).version,pkg.version);assert.equal(JSON.parse(run(process.execPath,[entry,'doctor','--json'])).local_ready,true);
 const status=JSON.parse(run(process.execPath,[entry,'skill','status','--target-directory',targetB,'--json']));assert.equal(status.version,pkg.version);assert.equal(status.up_to_date,true);
 console.log(JSON.stringify({ok:true,published_version:pkg.version,version_identity:'package/skill/runtime/receipt',independent_after_bootstrap_and_other_host_removed:true}));
}finally{await fs.rm(tmp,{recursive:true,force:true});}
