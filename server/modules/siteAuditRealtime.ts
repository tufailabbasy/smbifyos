import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { verifyToken } from "../utils/token.js";
import { getMainDb } from "../db/mainDb.js";
import { getDb, tenantLocalStorage } from "../db/database.js";
const subscriptions=new Map<WebSocket,{tenantId:string;jobId:string;exp:number}>();
let realtimeServer:WebSocketServer|null=null;
export function attachSiteAuditRealtimeServer(server:HttpServer):void{
  if(realtimeServer)return;
  realtimeServer=new WebSocketServer({server,path:"/ws/site-audit",verifyClient(info,done){
    const url=new URL(info.req.url||"/","http://localhost");
    const user=verifyToken(url.searchParams.get("token")||"");
    if(!user){done(false,401,"Unauthorized");return;}
    const exists=getMainDb().prepare("SELECT id FROM users WHERE id=? AND tenant_id=?").get(user.userId,user.tenantId);
    if(!exists){done(false,401,"Unauthorized");return;}
    const jobId=url.searchParams.get("jobId")||"";
    if(jobId&&!tenantLocalStorage.run({tenantId:user.tenantId},()=>getDb().prepare("SELECT id FROM site_audit_jobs WHERE id=?").get(jobId))){done(false,404,"Not found");return;}
    (info.req as any).auditSubscription={tenantId:user.tenantId,jobId,exp:user.exp};done(true);
  }});
  realtimeServer.on("connection",(socket,req)=>{
    const subscription=(req as any).auditSubscription;subscriptions.set(socket,subscription);
    socket.send(JSON.stringify({type:"site-audit.connected",emitted_at:new Date().toISOString(),job_id:subscription.jobId}));
    socket.on("close",()=>subscriptions.delete(socket));socket.on("error",()=>subscriptions.delete(socket));
  });
}
export function publishSiteAuditJobUpdate(job:{job_id:string}&Record<string,unknown>):void{
  const tenantId=tenantLocalStorage.getStore()?.tenantId;
  if(!tenantId)return;
  for(const [socket,s] of subscriptions){
    if(s.exp<Date.now()/1000){socket.close(1008,"Session expired");continue;}
    if(s.tenantId!==tenantId||(s.jobId&&s.jobId!==job.job_id)||socket.readyState!==WebSocket.OPEN)continue;
    socket.send(JSON.stringify({type:"site-audit.job",job_id:job.job_id,payload:job,emitted_at:new Date().toISOString()}));
  }
}
