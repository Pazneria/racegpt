import assert from 'node:assert/strict';
import {createMenu, createRaceGptLaunchUrl, draw, TRACKS, MENU_HOTSPOTS, CANCEL_HOTSPOT} from '../src/cabinet/racegpt-menu.js';

let launches=[], changes=[], backs=0;
const menu=createMenu({onStart:(selection,request)=>launches.push({selection,request}),
  onChange:state=>changes.push(state),onBack:()=>backs++});
assert.equal(menu.getState().trackId,'banked-shakedown');
assert.equal(menu.key({code:'Enter',repeat:true}),false);
assert.equal(launches.length,0);
menu.key({code:'ArrowLeft'});assert.equal(menu.getState().trackId,'jump-speedcheck');
menu.key({code:'ArrowRight'});assert.equal(menu.getState().trackId,'banked-shakedown');
menu.key({code:'ArrowRight'});assert.equal(menu.getState().trackId,'test-track-b');
assert.equal(menu.start(),true);assert.equal(menu.getState().phase,'loading');
assert.equal(menu.start(),false);assert.equal(launches.length,1);
assert.ok(Object.isFrozen(launches[0].selection));assert.ok(Object.isFrozen(launches[0].selection.settings));
assert.equal(menu.selectTrack('technical-bowl'),false);
assert.equal(menu.ready(-1),false);
assert.equal(menu.getHotspots().length,1);
menu.key({code:'Escape'});assert.equal(menu.getState().phase,'menu');
assert.equal(launches[0].request.signal.aborted,true);
assert.equal(menu.ready(launches[0].request.id),false);
assert.equal(menu.error(launches[0].request.id,'late'),false);
menu.start();assert.equal(launches.length,2);
assert.ok(launches[1].request.id>launches[0].request.id);
assert.equal(menu.error(launches[1].request.id,new Error('network')),true);
assert.equal(menu.getState().phase,'error');assert.equal(menu.getState().message,'START FAILED — TRY AGAIN');
menu.key({code:'Enter'});assert.equal(launches.length,3);
assert.equal(menu.ready(launches[2].request.id),true);
assert.equal(menu.ready(launches[2].request.id),false);
assert.equal(menu.key({code:'Enter'}),false);
assert.equal(menu.getHotspots().length,0);
menu.reset();assert.equal(menu.getState().phase,'menu');
assert.equal(launches[2].request.signal.aborted,true);

// Normalized pointer hits share exactly the same metadata as the painted targets.
const at=r=>({u:r.u+r.width/2,v:r.v+r.height/2});
menu.pointer({...at(MENU_HOTSPOTS[2]),type:'move'});
assert.equal(menu.getState().hover,'technical-bowl');
menu.pointer({type:'leave'});assert.equal(menu.getState().hover,null);
menu.pointer({...at(MENU_HOTSPOTS[2]),type:'up'});
assert.equal(menu.getState().trackId,'technical-bowl');
assert.equal(menu.pointer({u:NaN,v:0,type:'up'}),false);
assert.equal(menu.pointer({u:-1,v:0,type:'up'}),false);
menu.pointer({...at(MENU_HOTSPOTS[4]),type:'down'});assert.equal(launches.length,3);
menu.pointer({...at(MENU_HOTSPOTS[4]),type:'up'});assert.equal(launches.length,4);
menu.pointer({...at(MENU_HOTSPOTS[4]),type:'click'});assert.equal(launches.length,4);
menu.pointer({...at(CANCEL_HOTSPOT),type:'up'});assert.equal(menu.getState().phase,'menu');
menu.activate('back');assert.equal(backs,1);
menu.key({code:'Tab'});assert.equal(menu.getState().focus,'back');
menu.key({code:'Tab',shiftKey:true});assert.equal(menu.getState().focus,'start');
menu.key({code:'Tab',shiftKey:true});assert.equal(menu.getState().focus,'jump-speedcheck');
menu.key({code:'Enter'});assert.equal(menu.getState().trackId,'jump-speedcheck');
assert.equal(menu.getState().focus,'start');
menu.key({code:'Enter'});assert.equal(launches.length,5);
menu.dispose();assert.equal(menu.getState().phase,'disposed');
assert.equal(menu.reset(),false);assert.equal(menu.start(),false);
assert.equal(menu.ready(launches[4].request.id),false);
assert.equal(launches[4].request.signal.aborted,true);

const throwing=createMenu({onStart:()=>{throw new Error('oops');}});
throwing.start();assert.equal(throwing.getState().phase,'error');
const rejecting=createMenu({onStart:()=>Promise.reject(new Error('oops'))});
rejecting.start();await Promise.resolve();await Promise.resolve();
assert.equal(rejecting.getState().phase,'error');
let lateReject;
const late=createMenu({onStart:()=>new Promise((_,reject)=>{lateReject=reject;})});
late.start();late.cancel();lateReject(new Error('obsolete'));
await Promise.resolve();await Promise.resolve();assert.equal(late.getState().phase,'menu');
let reentrant;
reentrant=createMenu({onStart:()=>assert.fail('cancelled request must not launch'),
  onChange:s=>{if(s.phase==='loading')reentrant.cancel();}});
reentrant.start();assert.equal(reentrant.getState().phase,'menu');

const url=new URL(createRaceGptLaunchUrl('http://127.0.0.1:5178/racegpt/?from=arcade&returnTo=abc&autoplay&driver=codex&showcase=1',
  {trackId:'technical-bowl'}));
assert.equal(url.searchParams.get('track'),'technical-bowl');
assert.equal(url.searchParams.get('from'),'arcade');assert.equal(url.searchParams.get('returnTo'),'abc');
assert.equal(url.searchParams.has('autoplay'),false);assert.equal(url.searchParams.has('driver'),false);
assert.throws(()=>createRaceGptLaunchUrl('javascript:alert(1)',{trackId:'technical-bowl'}));
assert.throws(()=>createRaceGptLaunchUrl('https://user:pass@example.com/',{trackId:'technical-bowl'}));
assert.throws(()=>createRaceGptLaunchUrl('https://example.com/',{trackId:'invented'}));
assert.ok(Object.isFrozen(TRACKS[0].route));assert.ok(Object.isFrozen(TRACKS[0].route[0]));

// Source-only paint smoke: every phase/course paints without browser/graphics.
// Font metrics and physical perspective are reserved for coordinated visual review.
let painted=[], depth=0;
const ctx=new Proxy({canvas:{width:1280,height:960},save:()=>depth++,restore:()=>depth--,
  fillText:(s,x,y)=>{assert.ok(Number.isFinite(x)&&Number.isFinite(y));painted.push(s);},
  measureText:s=>({width:s.length*115}),createLinearGradient:()=>({addColorStop:()=>{}})},
  {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>{o[k]=v;return true;}});
for(const track of TRACKS)for(const phase of ['menu','loading','playing','error']) {
  painted=[];
  draw(ctx,{width:1280,height:960,time:3400,state:{phase,trackId:track.id,focus:'start'}});
  assert.ok(painted.includes('RACE'));assert.ok(painted.includes('GPT'));
  assert.ok(painted.includes('GAS'));assert.ok(painted.includes('STEER'));assert.ok(painted.includes('BRAKE'));
  assert.equal(depth,0);
}
draw(ctx,{width:768,height:550,time:Infinity,reducedMotion:true});assert.equal(depth,0);
console.log('PASS cabinet menu: navigation, normalized pointers, immutable selection, single launch, cancel/re-entry, stale completion, error/retry, disposal, URL contract, source paint smoke');
