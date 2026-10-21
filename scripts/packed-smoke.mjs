import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'product-packed-'));
const env={...process.env,PRODUCT_REFERENCE_REPLACEMENT_UPDATE_CHECK:'0',npm_config_dry_run:'false',npm_config_json:'false'};
function run(cmd,args,cwd=process.cwd()){const r=spawnSync(cmd,args,{cwd,env,encoding:'utf8',timeout:180000,windowsHide:true,shell:process.platform==='win32'&&cmd==='npm'});if(r.status!==0)throw Error(r.stdout+r.stderr);return r.stdout;}
try {
 const pack=JSON.parse(run('npm',['pack','--json','--pack-destination',dir]))[0];
 assert.ok(pack.files.every(f=>!/(^|\/)(outputs|development|node_modules|test)(\/|$)/.test(f.path)),'No private assets, dependencies or development material in package');
 const prefix=path.join(dir,'installed');run('npm',['install','--prefix',prefix,'--no-audit','--no-fund',path.join(dir,pack.filename)]);
 const root=path.join(prefix,'node_modules','@petercjl','product-reference-replacement'),cli=path.join(root,'bin/product-reference-replacement.mjs');
 const call=(...args)=>JSON.parse(run(process.execPath,[cli,...args]));
 assert.equal(call('version').version,'0.1.0');assert.equal(call('doctor').local_ready,true);
 const src=call('skill','source').source;assert.equal(await fs.realpath(src),await fs.realpath(path.join(root,'skills/product-reference-replacement')));
 const target=path.join(dir,'宿主技能');assert.equal(call('skill','install','--agent','custom-host','--target-directory',target,'--mode','copy').managed,true);assert.equal(call('skill','status','--agent','custom-host','--target-directory',target).up_to_date,true);
 const source=path.join(dir,'产品原图.png');run(process.execPath,['--input-type=module','-e',"import {createRequire} from 'node:module'; const require=createRequire(process.argv[1]); const sharp=require('sharp'); await sharp({create:{width:400,height:400,channels:3,background:'#aacb44'}}).png().toFile(process.argv[2]);",path.join(root,'package.json'),source]);
 const plan=path.join(dir,'plan.json');await fs.writeFile(plan,JSON.stringify({product_id:'smoke',variant:'green',width:640,height:360,panels:[{id:'a',label:'全貌',role:'overall',source,box:{x:0,y:0,width:320,height:360}},{id:'b',label:'局部',role:'detail',source,crop:{left:100,top:100,width:100,height:100},box:{x:320,y:0,width:320,height:360}}]}),{flag:'wx'});
 const board=call('board','render','--plan',plan,'--output-directory',path.join(dir,'board'));assert.equal(board.status,'draft');assert.equal(board.board.width/board.board.height,16/9);assert.ok(board.board.bytes>1000);assert.equal(board.update_check.status,'disabled');
 console.log(JSON.stringify({ok:true,packed_bytes:pack.size,files:pack.files.length,installed_version:'0.1.0',business_smoke:'real deterministic board',managed_install:'pass'}));
}finally{await fs.rm(dir,{recursive:true,force:true});}
