import { readCollaborationPackage } from '../shared/collaboration-package.mjs';
import { COLLABORATION_CONTRACT } from '../shared/collaboration-protocol.mjs';
const args=process.argv.slice(2);
if(args.length!==1||!['--skill','--schema','--manifest','--help'].includes(args[0])){console.error('Usage: node scripts/collaboration-inspect.mjs --skill | --schema | --manifest | --help');process.exitCode=2;}
else if(args[0]==='--help')console.log('Read-only packaged resources. --manifest does not claim a running session has loaded them. No sends, installs or runtime controls.');
else {const pkg=readCollaborationPackage();console.log(args[0]==='--skill'?pkg.skillText:JSON.stringify(args[0]==='--schema'?COLLABORATION_CONTRACT:pkg.manifest,null,2));}
