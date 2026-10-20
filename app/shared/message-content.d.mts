import type {Attachment,ContentBlock} from '../api/e/contracts.js';
export declare const ATTACHMENT_LIMITS: { readonly count: 4; readonly image: number; readonly text: number; readonly request: number };
export declare function attachmentText(a:Attachment):string;
export declare function validateMessage(content:unknown,attachments?:unknown,imageSupported?:boolean):{content:string;attachments:Attachment[]};
export declare function messageBlocks(content:string,attachments:Attachment[]):string|ContentBlock[];
