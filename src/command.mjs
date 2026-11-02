import {spawnSync} from 'node:child_process';
import {existsSync,realpathSync} from 'node:fs';
import path from 'node:path';

export function redact(value='') {
 return String(value)
  .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[redacted]@')
  .replace(/((?:authorization|_authToken|token|password|secret|cookie)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s,"'}]+/gi,'$1[redacted]')
  .replace(/\bBearer\s+\S+/gi,'Bearer [redacted]')
  .replace(/\bnpm_[a-zA-Z0-9]+\b/g,'[redacted]')
  .replace(/https:\/\/www\.npmjs\.com\/auth\/cli\/[^\s"']+/g,'[npm authentication URL redacted]')
  .slice(-2048);
}
export function describeError(error) {
 return {code:error.code??'INTERNAL_ERROR',message:redact(error.message),...(error.details?{details:sanitize(error.details)}:{})};
}
function sanitize(value){if(typeof value==='string')return redact(value);if(Array.isArray(value))return value.map(sanitize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/token|password|secret|cookie|authorization/i.test(k)?'[redacted]':sanitize(v)]));return value;}
export function npmProcess({environment=process.env,nodePath=process.execPath,platform=process.platform,exists=existsSync}={}) {
 const api=platform==='win32'?path.win32:path;
 const supplied=environment.AGENT_PACKAGE_NPM_PATH||(environment.npm_execpath?.endsWith('npm-cli.js')?environment.npm_execpath:null);
 const dir=api.dirname(nodePath);
 const search=(environment.PATH??environment.Path??'').split(api.delimiter).filter(Boolean);
 const candidates=supplied?[supplied]:[api.join(dir,'node_modules/npm/bin/npm-cli.js'),api.resolve(dir,'../lib/node_modules/npm/bin/npm-cli.js'),...search.flatMap(p=>[api.join(p,'node_modules/npm/bin/npm-cli.js'),api.join(p,'npm')])];
 const cli=candidates.map(p=>{try{return realpathSync(p);}catch{return p;}}).find(p=>p.endsWith('npm-cli.js')&&exists(p));
 if(!cli)throw Object.assign(new Error('Managed npm-cli.js is unavailable. The current host must provide npm_execpath or install npm beside its Node runtime.'),{code:'NPM_UNAVAILABLE',details:{command:'npm',system_code:'NPM_CLI_NOT_FOUND'}});
 return {command:nodePath,args:[cli]};
}
export function execute(cmd,args) {
 const invocation=cmd==='npm'?npmProcess():{command:cmd,args:[]};
 const r=spawnSync(invocation.command,[...invocation.args,...args],{encoding:'utf8',timeout:180000,windowsHide:true,shell:false});
 if(r.status!==0){
  let child;try{child=JSON.parse(r.stderr?.trim()||r.stdout?.trim()).error;}catch{}
  throw Object.assign(new Error(`${cmd} failed; inspect the recorded phase and installed state before retrying.`),{
   code:'COMMAND_FAILED',details:{command:cmd,exit_code:r.status,signal:r.signal??null,system_code:r.error?.code??null,
    child_code:child?.code??null,diagnostic:redact(child?.message||r.stderr||r.stdout||r.error?.message),
    ...(child?.details?{child_details:sanitize(child.details)}:{})}
  });
 }
 return r.stdout;
}
