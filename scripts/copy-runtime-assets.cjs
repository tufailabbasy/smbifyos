const fs=require("node:fs"),path=require("node:path");
function copy(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const source=path.join(dir,item.name);if(item.isDirectory())copy(source);else if(/\.(cjs|js|json)$/.test(item.name)){const target=path.join("dist",source);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}}}copy("server/modules");
console.log("Runtime scraper assets copied.");
