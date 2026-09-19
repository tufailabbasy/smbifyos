import dns from "node:dns";
import net from "node:net";
import { Agent } from "undici";
export function isPrivateAddress(address:string):boolean {
  const ip=address.toLowerCase().replace(/^\[|\]$/g,"");
  if(ip.startsWith("::ffff:")) {
    const tail=ip.slice(7);
    if(tail.includes("."))return isPrivateAddress(tail);
    const parts=tail.split(":");if(parts.length===2){const n=parseInt(parts[0],16)*65536+parseInt(parts[1],16);return isPrivateAddress([n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join("."));}
    return true;
  }
  if(net.isIP(ip)===4){const [a,b]=ip.split(".").map(Number);return a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19));}
  // Only globally routable IPv6 unicast is accepted, excluding IPv4 embedding tunnels.
  if(net.isIP(ip)===6)return !/^[23][0-9a-f]{3}:/.test(ip)||ip.startsWith("2001:db8:")||ip.startsWith("2002:")||ip.startsWith("2001:0:");
  return true;
}
function checkedLookup(hostname:string, options:any, callback:any) {
  dns.lookup(hostname,{all:true,verbatim:true},(err,addresses)=>{
    if(err)return callback(err);
    if(!addresses.length||addresses.some(a=>isPrivateAddress(a.address)))return callback(new Error("Private network destinations are not allowed"));
    if(options?.all)return callback(null,addresses);
    callback(null,addresses[0].address,addresses[0].family);
  });
}
const dispatcher=new Agent({connect:{lookup:checkedLookup as any},headersTimeout:20000,bodyTimeout:20000});
export function validatePublicUrl(value:string):URL {
  const url=new URL(value);
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error("Only public HTTP(S) URLs are supported");
  const host=url.hostname.replace(/^\[|\]$/g,"");
  if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||(net.isIP(host)&&isPrivateAddress(host)))throw new Error("Private network destinations are not allowed");
  return url;
}
export async function safeFetch(input:string|URL,init:RequestInit={}):Promise<Response>{
  let url=validatePublicUrl(String(input));
  for(let redirects=0;redirects<=5;redirects++){
    const response=await fetch(url,{...init,redirect:"manual",dispatcher,signal:init.signal||AbortSignal.timeout(20000)} as any);
    if(![301,302,303,307,308].includes(response.status)||!response.headers.get("location")||init.redirect==="manual")return response;
    await response.body?.cancel();
    url=validatePublicUrl(new URL(response.headers.get("location")!,url).toString());
  }
  throw new Error("Too many redirects");
}
