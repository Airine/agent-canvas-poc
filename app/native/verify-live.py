"""Verify private runtime facts; emit only sanitized acceptance evidence."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('data', type=Path)
parser.add_argument('pi_node')
parser.add_argument('codex_node')
parser.add_argument('output', type=Path)
parser.add_argument('--after-restart', action='store_true')
args = parser.parse_args()
record = json.loads((args.data / 'e' / args.pi_node / 'record.json').read_text())
view = record['view']
snapshot = view['snapshot']
denied_pi_tool = next(t for t in snapshot['tools'] if t.get('arguments', {}).get('command') == 'printf PI_NATIVE_DENY_6184')
assert denied_pi_tool.get('isError') is True
assert 'denied by user' in json.dumps(denied_pi_tool.get('result'))
assert 'PI_NATIVE_DENY_6184' not in json.dumps(denied_pi_tool.get('result'))
assistant = [''.join(b.get('text', '') for b in m['blocks'] if b['type'] == 'text')
             for m in snapshot['messages'] if m['role'] == 'assistant']
events = []
for file in (args.data / 'codex-native' / args.codex_node / 'runs').glob('*/trace.jsonl'):
    for line in file.read_text().splitlines():
        entry = json.loads(line)
        entry['run'] = file.parent.name
        events.append(entry)
events.sort(key=lambda e: e['time'])
completed = [e['message']['params'] for e in events if e['direction'] == 'from-server'
             and e['message'].get('method') == 'item/completed']
codex_text = [p['item']['text'] for p in completed if p['item']['type'] == 'agentMessage']
if not args.after_restart:
    assert 'PI_NATIVE_LIVE_OK' in assistant
    assert 'CEDAR-6184' in assistant
    assert 'PI_DENIED_OK' in assistant
    assert any(a['state'] == 'approved' for a in snapshot['approvals'])
    assert any(a['state'] == 'rejected' for a in snapshot['approvals'])
    assert any(t['state'] == 'completed' and 'PI_NATIVE_APPROVED_6184' in json.dumps(t.get('result')) for t in snapshot['tools'])
    assert 'CODEX_CANVAS_LIVE_OK' in codex_text and 'CODEX_TOOL_OK' in codex_text and 'CODEX_DENIED_OK' in codex_text
    commands = [p for p in completed if p['item']['type'] == 'commandExecution']
    approved = next(p for p in commands if 'CODEX_NATIVE_APPROVED_9265' in p['item'].get('aggregatedOutput', ''))
    denied = next(p for p in commands if 'CODEX_NATIVE_DENY_9265' in p['item'].get('command', '') and p['item']['status'] == 'declined')
    assert approved['item']['exitCode'] == 0
    assert not denied['item'].get('aggregatedOutput') and not denied['item'].get('processId')
    decisions = [e['message']['result']['decision'] for e in events if e['direction'] == 'to-server'
                 and isinstance(e['message'].get('result'), dict) and 'decision' in e['message']['result']]
    assert 'accept' in decisions and 'decline' in decisions
    result = {'pi': {'nativeSessionId': view['ref']['nativeSessionId'], 'liveReply': True,
                     'approvedToolExecuted': True, 'deniedTool': True, 'firstRestartRecall': 'CEDAR-6184',
                     'epochBeforeRestart': snapshot['epoch']},
              'codex': {'threadId': approved['threadId'], 'liveReply': True, 'approvedExitCode': 0,
                        'deniedStatus': 'declined', 'deniedOutputEmpty': True,
                        'hostRunBeforeRestart': events[-1]['run']}}
else:
    result = json.loads(args.output.read_text())
    assert view['ref']['nativeSessionId'] == result['pi']['nativeSessionId']
    assert snapshot['epoch'] != result['pi']['epochBeforeRestart']
    assert 'PI_RESTORED_CEDAR-6184' in assistant
    last = next(e for e in reversed(events) if e['direction'] == 'from-server'
                and e['message'].get('method') == 'item/completed'
                and e['message']['params']['item'].get('text') == 'MAPLE-9265')
    assert last['run'] != result['codex']['hostRunBeforeRestart']
    assert last['message']['params']['threadId'] == result['codex']['threadId']
    assert any(e['run'] == last['run'] and e['direction'] == 'to-server'
               and e['message'].get('method') == 'thread/resume'
               and e['message']['params']['threadId'] == result['codex']['threadId'] for e in events)
    result['pi']['sameNativeIdAfterApiRestart'] = True
    result['pi']['newEpochAfterApiRestart'] = True
    result['pi']['secondRestartRecall'] = 'PI_RESTORED_CEDAR-6184'
    result['pi']['deniedResult'] = 'denied by user'
    result['codex']['sameThreadAfterApiRestart'] = True
    result['codex']['newHostProcessRun'] = True
    result['codex']['restartRecall'] = 'MAPLE-9265'
args.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
