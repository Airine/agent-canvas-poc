import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../../src/index.css',import.meta.url),'utf8');
const light=css.split(':root.light {')[1].split('}')[0];
const tokens=Object.fromEntries([...light.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m=>[m[1],m[2]]));
function luminance(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
test('light text and semantic foreground tokens have 4.5:1 contrast on surfaces',()=>{
 for(const fg of ['--text-primary','--text-secondary','--text-tertiary','--accent','--st-queued','--st-running','--st-waiting','--st-completed','--st-failed','--st-skipped'])for(const bg of ['--canvas-bg','--surface-1','--surface-2','--surface-3']){
  const a=luminance(tokens[fg]),b=luminance(tokens[bg]);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,`${fg} / ${bg}: ${ratio}`);
 }
});
test('brand accent remains a valid whole CSS color, not overwritten by HSL channels',()=>{
 const values=[...css.matchAll(/--accent:\s*([^;]+);/g)].map(m=>m[1]);assert.ok(values.length>=2);assert.ok(values.every(v=>/^#[a-f0-9]{6}$/i.test(v)));
});
