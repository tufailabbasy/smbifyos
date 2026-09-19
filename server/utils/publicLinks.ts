import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { tenantLocalStorage } from "../db/database.js";
const secret = () => process.env.JWT_SECRET || process.env.TOKEN_ENCRYPTION_KEY || "";
export function publicToken(tenantId: string, kind: string, id: string, days = 180): string {
  if (!secret()) throw new Error("JWT_SECRET is required for share links");
  const data = Buffer.from(JSON.stringify({tenantId,kind,id,exp:Date.now()+days*86400000})).toString("base64url");
  return data+"."+crypto.createHmac("sha256",secret()).update(data).digest("base64url");
}
export function readPublicToken(token: string, kind: string, id: string): {tenantId:string} | null {
  try {
    const [data,sig,...extra]=token.split(".");
    if (!secret() || !data || !sig || extra.length) return null;
    const expected=crypto.createHmac("sha256",secret()).update(data).digest();
    const supplied=Buffer.from(sig,"base64url");
    if (supplied.length!==expected.length || !crypto.timingSafeEqual(supplied,expected)) return null;
    const p=JSON.parse(Buffer.from(data,"base64url").toString());
    if(p.kind!==kind || p.id!==id || !Number.isFinite(p.exp) || p.exp<Date.now() || !/^[a-zA-Z0-9_-]+$/.test(p.tenantId))return null;
    return {tenantId:p.tenantId};
  } catch {return null;}
}
export const publicTenant = (kind:string,param:string):RequestHandler => (req,res,next) => {
  const scoped=readPublicToken(String(req.query.share||""),kind,String(req.params[param]||""));
  if(!scoped){res.status(404).json({error:"This share link is invalid or has expired."});return;}
  tenantLocalStorage.run(scoped,next);
};
export function appBaseUrl(): string {
  const base=String(process.env.APP_BASE_URL||process.env.APP_URL||"").replace(/\/$/,"");
  if(!/^https?:\/\//i.test(base))throw new Error("Set APP_BASE_URL to the public application URL before sending email or sharing reports.");
  return base;
}
export function scopedPublicUrl(route:string,kind:string,id:string):string {
  return appBaseUrl()+route+"?share="+encodeURIComponent(publicToken(tenantLocalStorage.getStore()?.tenantId||"default",kind,id));
}
