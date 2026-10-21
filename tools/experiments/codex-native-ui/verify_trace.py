"""Verify real transport evidence, then export only scoped test facts."""
import json
from pathlib import Path
import sys


def verify(rows):
    def messages(direction):
        return [row['message'] for row in rows if row['direction'] == direction]

    server = messages('from-server')
    outgoing = messages('to-server')
    ui = messages('from-ui')
    turns = [m['params'] for m in server if m.get('method') == 'turn/completed']
    live = next(t for t in turns if any(i.get('text') == 'CODEX_NATIVE_UI_LIVE_OK'
                                      for i in t['turn']['items']))
    denied = next(t for t in turns if any(i.get('text') == 'APPROVAL_DECLINED_OK'
                                        for i in t['turn']['items']))
    assert live['turn']['status'] == denied['turn']['status'] == 'completed'
    assert live['threadId'] == denied['threadId']
    approval = next(m for m in server if m.get('method') == 'item/commandExecution/requestApproval'
                    and m['params']['turnId'] == denied['turn']['id'])
    ui_response = next(m['response'] for m in ui if m.get('type') == 'mcp-response'
                       and m['response']['id'] == approval['id'])
    assert ui_response['result']['decision'] in {'decline', 'cancel'}
    assert any(m.get('id') == approval['id'] and m.get('result') == ui_response['result']
               for m in outgoing)
    command = next(m['params']['item'] for m in server if m.get('method') == 'item/completed'
                   and m['params']['item']['id'] == approval['params']['itemId'])
    assert command['status'] == 'declined'
    assert command['processId'] is None and command['exitCode'] is None
    assert command['aggregatedOutput'] is None
    starts = [m['params'] for m in outgoing if m.get('method') == 'turn/start']
    ui_starts = [m['request']['params'] for m in ui if m.get('type') == 'mcp-request'
                 and m['request']['method'] == 'turn/start']
    assert len(starts) == len(ui_starts) == 2
    assert all(s['sandboxPolicy']['type'] == 'readOnly' and s['approvalPolicy'] == 'on-request'
               and s['approvalsReviewer'] == 'user' for s in starts)
    assert all(any(s['input'] == u['input'] and s['threadId'] == u['threadId']
                   for u in ui_starts) for s in starts)
    return {
        'extensionVersion': '26.51007.21434', 'codexVersion': '0.162.0-alpha.17.2',
        'threadId': live['threadId'], 'realUiTurns': len(starts),
        'firstReply': 'CODEX_NATIVE_UI_LIVE_OK', 'firstTurnStatus': live['turn']['status'],
        'approvalMethod': approval['method'], 'approvalRequestId': approval['id'],
        'command': command['command'], 'uiDecision': ui_response['result']['decision'],
        'commandStatus': command['status'], 'commandProcessId': command['processId'],
        'finalReply': 'APPROVAL_DECLINED_OK', 'finalTurnStatus': denied['turn']['status'],
        'approvedExecutionTested': False,
    }


if __name__ == '__main__':
    rows = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines()]
    result = verify(rows)
    Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
