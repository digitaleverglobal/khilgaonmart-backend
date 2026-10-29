const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
(async()=>{
let calls=[],response;
const context={module:{exports:{}},console,setTimeout:(fn)=>{fn();},require:(p)=>{
 if(p.endsWith('catchAsync'))return fn=>fn;
 if(p.endsWith('sendResponse'))return (r,data)=>response=data;
 if(p.endsWith('tracking.service'))return {trackEvent:async payload=>{calls.push(payload); return {results:[{ok:calls.length>1}]};}};
 if(p.endsWith('order.service'))return {createOrderInDB:async()=>({Id:9,orderId:'ORD9',totalBill:500,customerPhone:'01700000000'})};
 return {};
}};
vm.runInNewContext(fs.readFileSync('app/modules/order/order.controller.js','utf8'),context);
await context.module.exports.createOrder({body:{landingTracking:{enabled:true,customData:{value:999}}},headers:{},ip:'127.0.0.1'},{});
await new Promise(setImmediate);
assert.equal(response.statusCode,201);assert.equal(calls.length,2);assert.equal(calls[0].eventId,calls[1].eventId);assert.equal(response.data.purchaseEventId,calls[0].eventId);assert.equal(calls[0].customData.value,500);
calls=[];await context.module.exports.createOrder({body:{landingTracking:{enabled:false}},headers:{}},{});assert.equal(calls.length,0);
console.log('PASS: saved-order value, stable ID, retry, preview suppression');
let posts=[],warnings=[];
const browser={console:{warn:(...args)=>warnings.push(args)},URLSearchParams,window:{location:{href:'https://shop.test/landing-page/1',search:''}},document:{cookie:'',referrer:''},apiRequest:async(path,options)=>{if(path==='/tracking/config')return {data:{}};posts.push(JSON.parse(options.body));return {data:{results:[{platform:'meta',ok:false,status:400}]}};}};
let src=fs.readFileSync('D:/perfectshop/perfectshop-admin/src/services/trackingService.js','utf8').replace(/^import .*;\r?\n/,'').replace(/export /g,'');
vm.runInNewContext(src,browser);
assert.equal(await browser.trackMarketingEvent('Purchase',{eventId:'Purchase.order.9',server:false}),'Purchase.order.9');assert.equal(posts.length,0);
assert.equal(await browser.trackMarketingEvent('PageView'),null);assert.equal(warnings.length,1);
browser.setTrackingSuspended(true);await browser.trackMarketingEvent('PageView');assert.equal(posts.length,1);
console.log('PASS: browser-only Purchase, API failure detection, preview suppression');
})().catch(e=>{console.error(e);process.exitCode=1});

(async()=>{
const payloads=[];
const ctx={module:{exports:{}},process:{env:{NODE_ENV:'production'}},AbortSignal,console,fetch:async(url,options)=>{payloads.push(JSON.parse(options.body));return {ok:true,status:200,json:async()=>({events_received:1})}},require:p=>{
 if(p==='crypto')return require('crypto');
 if(p.includes('facebookPixel.service'))return {getActiveFromDB:async()=>[{toJSON:()=>({pixelsId:'123',metaAccessToken:'mock',testEventId:'TEST'})}]};
 if(p.includes('tiktokPixel.service')||p.includes('googleAds.service'))return {getActiveFromDB:async()=>[]};
 return Error;
}};
vm.runInNewContext(fs.readFileSync('app/modules/tracking/tracking.service.js','utf8'),ctx);
await ctx.module.exports.trackEvent({eventName:'PageView',eventId:'e1',userData:{phone:'01700000000'},customData:{}},{headers:{},ip:'127.0.0.1'});
assert.equal(payloads[0].test_event_code,undefined);
assert.equal(payloads[0].data[0].user_data.ph[0],require('crypto').createHash('sha256').update('8801700000000').digest('hex'));
console.log('PASS: production test-code suppression and BD phone normalization');
})().catch(e=>{console.error(e);process.exitCode=1});
