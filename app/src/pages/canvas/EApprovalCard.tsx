import type { LiveStore } from './live-store';
import type { SessionApproval } from '../../../api/e/contracts';
import { ApprovalRequest } from './chat/ApprovalRequest';
/** Compatibility facade for callers outside the new transcript. */
export function EApprovalCard(props:{approval:SessionApproval;store:LiveStore;nodeId:string}){return <ApprovalRequest {...props}/>;}
