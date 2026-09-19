export interface DirectoryCitationItem {
  directory: string;
  icon: string;
  status: "verified_match" | "mismatch_detected" | "missing_listing" | "not_checked";
  name: string;
  address: string;
  phone: string;
  issues: string[];
}
export interface NapAuditReport {
  businessName:string; standardAddress:string; standardPhone:string; consistencyScore:number|null;
  totalDirectoriesChecked:number; matchingCount:number; mismatchCount:number; missingCount:number;
  directories:DirectoryCitationItem[]; riskSummary:string; recommendedAction:string; generatedAt:string; dataSource:"not_checked"|"verified";
}
const directoryNames = [
  ["Google Business Profile","🌐"],["Yelp for Business","🔴"],["Apple Business Connect","🍎"],
  ["Bing Places for Business","🟦"],["YellowPages","🟡"],["Better Business Bureau","🛡️"],["Facebook Business Place","📘"]
] as const;
export function generateNapAudit(params:{businessName:string;address?:string;city?:string;state?:string;phone?:string;website?:string;baseScore?:number;}):NapAuditReport {
  const address=params.address||[params.city,params.state].filter(Boolean).join(", ");
  const directories=directoryNames.map(([directory,icon])=>({directory,icon,status:"not_checked" as const,name:"",address:"",phone:"",issues:["No directory API or imported citation evidence was supplied."]}));
  return {businessName:params.businessName,standardAddress:address,standardPhone:params.phone||"",consistencyScore:null,totalDirectoriesChecked:0,matchingCount:0,mismatchCount:0,missingCount:0,directories,riskSummary:"Citation consistency has not been measured. Directory records must be imported or checked through an approved provider.",recommendedAction:"Connect a citation data provider or upload verified directory URLs before using NAP findings in a client report or outreach message.",generatedAt:new Date().toISOString(),dataSource:"not_checked"};
}