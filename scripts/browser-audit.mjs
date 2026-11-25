#!/usr/bin/env node
import fs from "node:fs";
import { chromium } from "playwright";
const BASE=process.env.SITE_URL||"http://127.0.0.1:8769";
const files=fs.readdirSync(process.cwd()).filter(x=>x.endsWith(".html")).sort();
const errors=[];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.on("pageerror",e=>errors.push("Runtime: "+e.message));
for(const file of files){
 try{
  const response=await page.goto(BASE+"/"+file,{waitUntil:"domcontentloaded",timeout:20000});
  if(!response||response.status()>=400)errors.push(file+": HTTP "+(response?.status()||"no response"));
  const metadata=await page.evaluate(()=>{
   const ids=[...document.querySelectorAll("[id]")].map(x=>x.id);
   const json=[...document.querySelectorAll('script[type="application/ld+json"]')].map(x=>x.textContent);
   const badJson=[];
   for(const s of json){try{JSON.parse(s)}catch(e){badJson.push(e.message)}}
   return {title:document.title,h1:document.querySelectorAll("h1").length,duplicateIds:ids.filter((id,i)=>ids.indexOf(id)!==i),badJson,externalBlank:[...document.querySelectorAll('a[target="_blank"]')].filter(a=>!a.rel.split(/\s+/).some(token=>token.toLowerCase()==="noopener")).length};
  });
  if(!metadata.title.trim())errors.push(file+": empty title");
  if(metadata.h1!==1)errors.push(file+": expected exactly one H1, got "+metadata.h1);
  if(metadata.duplicateIds.length)errors.push(file+": duplicate IDs "+metadata.duplicateIds.join(", "));
  if(metadata.badJson.length)errors.push(file+": invalid JSON-LD "+metadata.badJson.join("; "));
  if(metadata.externalBlank)errors.push(file+": target=_blank links missing rel=noopener: "+metadata.externalBlank);
 }catch(e){errors.push(file+": "+e.message);}
}
await page.goto(BASE+"/products.html",{waitUntil:"domcontentloaded"});
const entries=page.locator(".policy-entry");
if(await entries.count()!==72)errors.push("products.html: expected 71 policies, got "+await entries.count());
await page.locator("#search").fill("krasivyj-launcher");
if(await entries.filter({visible:true}).count()!==1)errors.push("products.html: policy search does not isolate krasivyj-launcher");
await page.locator("#search").fill("");
await page.setViewportSize({width:390,height:844});
const mobile=await page.evaluate(()=>({
  client:document.documentElement.clientWidth,
  scroll:document.documentElement.scrollWidth,
  offenders:[...document.querySelectorAll("body *")].map(el=>({tag:el.tagName,id:el.id,cls:typeof el.className==="string"?el.className:"",width:Math.round(el.getBoundingClientRect().width),right:Math.round(el.getBoundingClientRect().right),text:(el.textContent||"").trim().slice(0,100)})).filter(x=>x.right>document.documentElement.clientWidth+2).slice(0,15)
}));
if(mobile.scroll>mobile.client+2)errors.push("products.html: horizontal overflow at 390px; offenders="+JSON.stringify(mobile.offenders));
await browser.close();
console.log("Privacy catalog browser audit: "+files.length+" pages, 72 policy entries, JSON-LD, IDs, links, search and mobile.");
console.log("Errors: "+errors.length);
for(const error of errors)console.error("ERROR:",error);
if(errors.length)process.exitCode=1;
