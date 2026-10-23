import {spawnSync} from 'node:child_process';

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
export function execute(cmd,args) {
 const r=spawnSync(cmd,args,{encoding:'utf8',timeout:180000,windowsHide:true,shell:process.platform==='win32'&&cmd==='npm'});
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
