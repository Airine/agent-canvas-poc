import test from 'node:test';import assert from 'node:assert/strict';
import {approvalAuditLabel,approvalProgress,allPendingReviewing} from '../../src/pages/canvas/chat/approval-presentation.ts';
import {sessionNotices,presentation} from '../../src/pages/canvas/chat/presentation-state.ts';
test('audit distinguishes rule interception, actual AI, missing prerequisites and legacy evidence',()=>{
 assert.match(approvalAuditLabel({source:'manual',state:'manual',reviewAttempted:false}),/未调用 AI/);
 assert.match(approvalAuditLabel({source:'ai',state:'manual',reviewAttempted:true}),/AI 审查后/);
 assert.match(approvalAuditLabel({source:'ai',state:'manual',reviewAttempted:false}),/未启动/);
 assert.match(approvalAuditLabel({source:'ai',state:'manual'}),/旧版/);
 assert.match(approvalAuditLabel({source:'ai',state:'failed',reviewAttempted:true}),/失败/);
 assert.match(approvalAuditLabel({source:'ai',state:'submitted',reviewAttempted:true}),/待 e 确认/);
});
test('only all actively AI-reviewed requests replace the manual approval notice',()=>{
 const view={lifecycle:'ready',approvalMode:'assisted',approvalAudit:[{approvalId:'p',source:'ai',state:'reviewing',reviewAttempted:true}],snapshot:{status:'idle',approvals:[{id:'p',state:'pending'}],runs:[],messages:[],tools:[],pendingActions:[],capabilities:[]}};
 assert.equal(approvalProgress(view,'p').title,'AI 正在审查');assert.equal(allPendingReviewing(view),true);assert.match(presentation(view,true).label,/AI 审查中/);assert.match(sessionNotices(view,true).find(n=>n.id==='approval').description,/无需重复/);
 view.snapshot.approvals.push({id:'other',state:'pending'});assert.equal(allPendingReviewing(view),false);assert.match(sessionNotices(view,true).find(n=>n.id==='approval').title,/等待批准/);
 view.approvalMode='manual';assert.equal(approvalProgress(view,'p').reviewing,false);
});
