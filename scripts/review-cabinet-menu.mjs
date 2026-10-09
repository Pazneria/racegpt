// Run only inside a coordinated graphics slot. One headless process; no window.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const port=Number(process.env.REVIEW_PORT || 5547);
const evidence=path.join(root,'evidence');
await fs.mkdir(evidence,{recursive:true});
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)||!['.html','.js'].includes(path.extname(file)))throw new Error('outside review files');
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');
    res.end(await fs.readFile(file));
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
let browser;
const report={kind:'flat Canvas2D screen review, not physical cabinet acceptance',courses:[],errors:[],renderMs:null};
try {
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),
    args:['--disable-gpu','--disable-webgl','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1280,height:980},deviceScaleFactor:1,reducedMotion:'reduce'});
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(`http://127.0.0.1:${port}/cabinet-preview.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__cabinetReview);
  const canvas=page.locator('canvas');
  for(const [i,id] of ['banked-shakedown','test-track-b','technical-bowl','jump-speedcheck'].entries()) {
    await page.evaluate(id=>{window.__cabinetReview.menu.selectTrack(id);window.__cabinetReview.paint(3200);},id);
    await canvas.screenshot({path:path.join(evidence,`title-track-${i+1}.png`)});
    report.courses.push(id);
  }
  await page.evaluate(()=>{
    const {menu,paint}=window.__cabinetReview;menu.reset();menu.start();paint(3400);
  });
  await canvas.screenshot({path:path.join(evidence,'title-loading.png')});
  await page.evaluate(()=>{
    const {menu,paint}=window.__cabinetReview;menu.error(menu.getState().requestId,'review error');paint(3400);
  });
  await canvas.screenshot({path:path.join(evidence,'title-error.png')});
  await page.evaluate(()=>window.__cabinetReview.menu.reset());
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>window.__cabinetReview.menu.getState().trackId),'banked-shakedown');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.__cabinetReview.menu.getState().phase),'loading');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__cabinetReview.menu.getState().phase),'menu');
  const r=await canvas.boundingBox();
  await page.mouse.click(r.x+r.width*(64+292*2+138)/1280,r.y+r.height*642/960);
  assert.equal(await page.evaluate(()=>window.__cabinetReview.menu.getState().trackId),'technical-bowl');
  await page.evaluate(()=>window.__cabinetReview.menu.reset());
  report.renderMs=await page.evaluate(()=>{
    const {draw,menu}=window.__cabinetReview,c=document.querySelector('canvas'),ctx=c.getContext('2d');
    const begin=performance.now();for(let i=0;i<100;i++)draw(ctx,{time:i*100,state:menu.getState()});
    return Number(((performance.now()-begin)/100).toFixed(3));
  });
  await page.setViewportSize({width:512,height:384});
  await canvas.screenshot({path:path.join(evidence,'title-flat-512.png')});
  assert.deepEqual(report.errors,[]);
  report.keyboardPointer='PASS choose, start, cancel, normalized pointer course selection';
  report.browser='One headless Chromium, GPU/WebGL disabled, loopback-only requests';
  await fs.writeFile(path.join(evidence,'flat-review.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
