import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function loadPiImageProcessor(piBin) {
 const candidate=path.isAbsolute(piBin)?piBin:(process.env.PATH??'').split(path.delimiter).map(dir=>path.join(dir,piBin)).find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return fs.statSync(file).isFile();}catch{return false;}});
 if(!candidate)throw Error('无法定位当前 Pi 图片验证器，图片未发送');
 let dir=path.dirname(fs.realpathSync(candidate));
 for(let depth=0;depth<5;depth++,dir=path.dirname(dir)){
  const manifest=path.join(dir,'package.json');
  if(!fs.existsSync(manifest))continue;
  const info=JSON.parse(fs.readFileSync(manifest,'utf8'));
  if(info.name!=='@earendil-works/pi-coding-agent')continue;
  const module=await import(pathToFileURL(path.join(dir,'dist/utils/image-process.js')).href);
  if(typeof module.processImage!=='function')break;
  return module.processImage;
 }
 throw Error('当前 Pi 安装没有兼容的图片验证能力，图片未发送');
}
export async function assertImagesUnchanged(attachments,model,processImage){
 for(const image of attachments.filter(a=>a.mimeType!=='text/plain')){
  const result=await processImage(Buffer.from(image.data,'base64'),image.mimeType,{autoResizeImages:true,resizeOptions:model?.inputLimits?.images?.resize});
  if(!result?.ok)throw Error(`图片 ${image.name} 无法被 Pi 解码，已阻止发送；请重新选择有效图片`);
  if(result.data!==image.data||result.mimeType!==image.mimeType||result.hints?.length)throw Error(`图片 ${image.name} 超出当前 Pi 原样输入能力；请先调整尺寸再重新选择，未静默缩放或漏发`);
 }
}
