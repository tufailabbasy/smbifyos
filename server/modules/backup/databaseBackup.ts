import fs from "node:fs";
import path from "node:path";
import { getDb, tenantLocalStorage } from "../../db/database.js";
import { getMainDb } from "../../db/mainDb.js";
const BACKUP_DIR=path.resolve(process.cwd(),"db/backups");
export interface BackupInfo {filename:string;filepath:string;sizeBytes:number;createdAt:string;}
function ensure(){fs.mkdirSync(BACKUP_DIR,{recursive:true});}
function info(filename:string):BackupInfo{const filepath=path.join(BACKUP_DIR,filename),stat=fs.statSync(filepath);return {filename,filepath,sizeBytes:stat.size,createdAt:stat.mtime.toISOString()};}
export function performDatabaseBackup(options:{allTenants?:boolean}={}):{success:boolean;backups:BackupInfo[];error?:string}{
  ensure();const backups:BackupInfo[]=[];const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  try{
    const ids=options.allTenants?(getMainDb().prepare("SELECT id FROM tenants").all() as any[]).map(t=>t.id):[tenantLocalStorage.getStore()?.tenantId||"default"];
    for(const id of ids)tenantLocalStorage.run({tenantId:id},()=>{const name="tenant_"+id+"_"+stamp+".db";getDb().exec("VACUUM INTO '"+path.join(BACKUP_DIR,name).replace(/\\/g,"/").replace(/'/g,"''")+"'");backups.push(info(name));});
    if(options.allTenants){const name="central_"+stamp+".db";getMainDb().exec("VACUUM INTO '"+path.join(BACKUP_DIR,name).replace(/\\/g,"/").replace(/'/g,"''")+"'");backups.push(info(name));}
    if(options.allTenants)pruneOldBackups();
    return {success:true,backups};
  }catch(e){return {success:false,backups,error:e instanceof Error?e.message:String(e)};}
}
export function listBackups():BackupInfo[]{ensure();const prefix="tenant_"+(tenantLocalStorage.getStore()?.tenantId||"default")+"_";return fs.readdirSync(BACKUP_DIR).filter(f=>f.startsWith(prefix)&&f.endsWith(".db")).map(info).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export function pruneOldBackups(days=14):number{ensure();let count=0;for(const f of fs.readdirSync(BACKUP_DIR)){if(!/^(tenant_|central_).+\.db$/.test(f))continue;const full=path.join(BACKUP_DIR,f);if(Date.now()-fs.statSync(full).mtimeMs>days*86400000){fs.unlinkSync(full);count++;}}return count;}
export function startAutomatedBackupScheduler():void{
  const run=()=>{const result=performDatabaseBackup({allTenants:true});if(!result.success)console.error("[backup]",result.error);};
  setTimeout(run,10000).unref();setInterval(run,86400000).unref();
}
