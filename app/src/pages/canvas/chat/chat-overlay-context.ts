import { createContext, type RefObject } from 'react';
export const ChatOverlayContext = createContext<{open:string;setOpen:(id:string)=>void;close:(id:string)=>void;composing:RefObject<boolean>} | null>(null);
