import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {execute,npmProcess} from '../src/command.mjs';
test('managed npm uses the host Node and JavaScript entry even when Node is an embedded executable',()=>{
 const nodePath='C:\\Program Files\\Host\\host.exe',cli='C:\\Program Files\\Host\\npm\\bin\\npm-cli.js';
 assert.deepEqual(npmProcess({platform:'win32',nodePath,environment:{npm_execpath:cli},exists:p=>p===cli}),{command:nodePath,args:[cli]});
 assert.throws(()=>npmProcess({platform:'win32',nodePath,environment:{npm_execpath:cli},exists:()=>false}),{code:'NPM_UNAVAILABLE'});
});
test('standalone runtimes locate adjacent npm without selecting a Windows shell shim',()=>{
 const cli='C:\\node\\node_modules\\npm\\bin\\npm-cli.js';
 assert.deepEqual(npmProcess({platform:'win32',nodePath:'C:\\node\\node.exe',environment:{},exists:p=>p===cli}).args,[cli]);
});
test('npm receives exact non-ASCII, spaces and shell metacharacters with no system npm in PATH',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'managed npm 中文 & ')),cli=path.join(dir,'npm-cli.js');
 const saved={npm_execpath:process.env.npm_execpath,AGENT_PACKAGE_NPM_PATH:process.env.AGENT_PACKAGE_NPM_PATH,PATH:process.env.PATH};
 try{fs.writeFileSync(cli,'console.log(JSON.stringify(process.argv.slice(2)))',{flag:'wx'});process.env.npm_execpath=cli;delete process.env.AGENT_PACKAGE_NPM_PATH;process.env.PATH='';
 const args=['install','--prefix',path.join(dir,'技能 & 资产 %name%'),'--ignore-scripts'];assert.deepEqual(JSON.parse(execute('npm',args)),args);
 }finally{for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}fs.rmSync(dir,{recursive:true,force:true});}
});
