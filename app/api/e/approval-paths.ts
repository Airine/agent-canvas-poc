import fs from 'node:fs';
import path from 'node:path';
export const sensitive=/(^|[/._-])(env|ssh|aws|gnupg|credentials?|secrets?|tokens?|auth|id_rsa|id_ed25519)([/._-]|$)|\.pem$|\.key$|\.git(?:[/]|$)/i;
function inside(root:string,target:string) {const rel=path.relative(root,target);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
export function safePath(root:string,input:string,newFile=false): string | undefined {
 if(!input||input.includes('\0')||input.startsWith('~')||sensitive.test(input))return;
 if(input.split(/[\\/]/).includes('..'))return;
 const resolved=path.resolve(root,input);if(!inside(root,resolved))return;
 if(path.relative(root,resolved).split(path.sep).some(part=>part.startsWith('.')))return;
 try{
  // An in-project directory alias can still target .git or executable config.
  // Keep assisted approval conservative: reject symlinks at every component.
  let current=root;
  for(const part of path.relative(root,resolved).split(path.sep).filter(Boolean)) {
   current=path.join(current,part);
   try { if(fs.lstatSync(current).isSymbolicLink())return; }
   catch(error) { if(!newFile || current!==resolved || (error as NodeJS.ErrnoException).code!=='ENOENT')return; }
  }
  const real=fs.realpathSync(newFile?path.dirname(resolved):resolved);
  if(!inside(root,real))return;
  if(fs.existsSync(resolved)&&fs.lstatSync(resolved).isSymbolicLink())return;
  return resolved;
 }catch{return;}
}
