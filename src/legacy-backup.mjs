import fs from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE,readJSON,hashes,exists,fail} from './common.mjs';
const canonical=h=>Object.fromEntries(Object.entries(h).filter(([k])=>!k.startsWith('agents/')));
const equal=(a,b)=>Object.keys({...a,...b}).every(k=>a[k]===b[k]);

// The immutable 0.3.0 updater passes no backup path. Bind its snapshot to its
// still-held target-parent lock; historical, ambiguous or corrupt snapshots fail closed.
export async function legacyBackup(target,source) {
 const parent=path.dirname(target),lock=await exists(path.join(parent,'.product-reference-maintenance-lock'));
 if(!lock?.isDirectory())return null;
 const candidates=[];
 for(const e of await fs.readdir(parent,{withFileTypes:true})){
  if(!e.isDirectory()||!e.name.startsWith('.product-reference-maintenance-backup-'))continue;
  const dir=path.join(parent,e.name),stat=await fs.stat(dir);
  if(stat.birthtimeMs+2<lock.birthtimeMs)continue;
  const pkg=await readJSON(path.join(dir,'package/package.json')).catch(()=>null);
  if(pkg?.name!==PACKAGE)continue;
  const current=await readJSON(path.resolve(source,'../../package.json'));
  if(pkg.version===current.version)continue;
  const skill=path.join(dir,'skill');if(!await exists(skill))continue;
  const original=path.join(dir,'package/skills/product-reference-replacement');
  const baseline=await readJSON(path.join(dir,'package/skill-integrity.json')).catch(()=>null);
  if(!baseline||!equal(canonical(await hashes(original)),canonical(baseline)))
   fail('LEGACY_BACKUP_INVALID','Pre-replacement snapshot cannot be verified; preserve it and inspect before migration.');
  candidates.push({directory:dir,skill,package:path.join(dir,'package'),version:pkg.version,verified:true,skill_matches_package:equal(canonical(await hashes(skill)),canonical(await hashes(original))),origin:'legacy-updater-before-package-replacement'});
 }
 if(candidates.length>1)fail('LEGACY_BACKUP_AMBIGUOUS','Multiple active legacy snapshots; inspect the update before migration.');
 return candidates[0]??null;
}
