import test from 'node:test';import assert from 'node:assert/strict';
import {assertImagesUnchanged} from '../../scripts/e-message-preflight.mjs';
import {messageBlocks} from '../../api/e/attachments.ts';
const image={id:'i',name:'test.png',mimeType:'image/png',data:'AAAA'};
test('runtime image preflight refuses omitted, transformed and hint-modified payloads before e send',async()=>{
 await assert.rejects(assertImagesUnchanged([image],{},async()=>({ok:false})),/无法被 Pi 解码/);
 for(const change of [{data:'BBBB'},{mimeType:'image/jpeg'},{hints:['resized']}])await assert.rejects(assertImagesUnchanged([image],{},async()=>({ok:true,data:image.data,mimeType:image.mimeType,hints:[],...change})),/未静默/);
 let options;await assertImagesUnchanged([image],{inputLimits:{images:{resize:{maxWidth:123}}}},async(_b,_m,o)=>{options=o;return {ok:true,data:image.data,mimeType:image.mimeType,hints:[]};});assert.equal(options.resizeOptions.maxWidth,123);
});
test('image-only sends retain the empty text block Pi actually observes',()=>{assert.deepEqual(messageBlocks('',[image]),[{type:'text',text:''},{type:'image',mimeType:image.mimeType,data:image.data}]);});
