"""Read private runtime evidence; publish only synthetic acceptance facts."""
import argparse
import base64
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('root', type=Path, help='Dedicated native-integration directory')
p.add_argument('pi_node')
p.add_argument('codex_node')
p.add_argument('output', type=Path)
args = p.parse_args()
view = json.loads((args.root / 'data/e' / args.pi_node / 'record.json').read_text())['view']
messages = view['snapshot']['messages']
texts = [''.join(b.get('text', '') for b in m['blocks'] if b['type'] == 'text') for m in messages if m['role'] == 'assistant']
fixture = (Path(__file__).parent / 'evidence/fixtures/colors.png').read_bytes()
assert any(b.get('type') == 'image' and base64.b64decode(b['data']) == fixture for m in messages for b in m['blocks'])
assert any(all(s in text for s in ['blue', 'yellow', 'RIVER-4827', '17']) for text in texts)
assert view['configuration']['model']['id'] == 'gpt-6.1-sol'
assert view['configuration']['thinkingLevel'] == 'low'
assert view['approvalMode'] == 'manual'
assert view['ref']['nativeSessionId'] == json.loads((Path(__file__).parent / 'evidence/acceptance.json').read_text())['pi']['nativeSessionId']
assert (args.root / 'workspace/pi-native-permission-test.txt').read_text() == 'PI_EDIT_MODE_4827'
assert any(t['name'] == 'write' and 'pi-native-permission-test.txt' in json.dumps(t.get('arguments')) and not t.get('isError') for t in view['snapshot']['tools'])
denied = next(t for t in view['snapshot']['tools'] if t.get('arguments', {}).get('command') == 'printf PI_EDIT_SHELL_4827')
assert denied['isError'] and 'denied by user' in json.dumps(denied['result'])
assert 'PI_EDIT_SHELL_4827' not in json.dumps(denied['result'])
events = []
for file in (args.root / 'data/codex-native' / args.codex_node / 'runs').glob('*/trace.jsonl'):
    for line in file.read_text().splitlines():
        entry = json.loads(line); entry['run'] = file.parent.name; events.append(entry)
events.sort(key=lambda e: e['time'])
turns = [e for e in events if e['direction'] == 'to-server' and e['message'].get('method') == 'turn/start']
image_turn = next(e for e in reversed(turns) if any(i['type'] == 'localImage' for i in e['message']['params']['input']))
image_params = image_turn['message']['params']
assert image_params['model'] == 'gpt-6-sol' and image_params['effort'] == 'medium'
image = next(i for i in image_params['input'] if i['type'] == 'localImage')
assert Path(image['path']).read_bytes() == fixture
completed = [e for e in events if e['direction'] == 'from-server' and e['message'].get('method') == 'item/completed']
assert any(all(s in e['message']['params']['item'].get('text', '') for s in ['yellow', 'blue', 'RIVER-4827', '17']) for e in completed)
write_turn = next(e for e in reversed(turns) if e['message']['params']['sandboxPolicy']['type'] == 'workspaceWrite')
policy = write_turn['message']['params']['sandboxPolicy']
assert policy['writableRoots'] == [str(args.root / 'workspace')] and policy['networkAccess'] is False
assert write_turn['message']['params']['approvalPolicy'] == 'on-request'
command = next(e for e in completed if e['run'] == write_turn['run'] and e['message']['params']['item'].get('aggregatedOutput') == 'CODEX_WORKSPACE_4827')
assert command['message']['params']['item']['exitCode'] == 0
assert not any(e['run'] == write_turn['run'] and e['message'].get('method') == 'item/commandExecution/requestApproval' for e in events)
assert (args.root / 'workspace/codex-native-permission-test.txt').read_text() == 'CODEX_WORKSPACE_4827'
resumed = [e for e in events if e['time'] > command['time'] and e['direction'] == 'to-server' and e['message'].get('method') == 'thread/resume']
assert resumed and resumed[-1]['run'] != write_turn['run']
assert resumed[-1]['message']['params']['sandbox'] == 'read-only'
assert resumed[-1]['message']['params']['threadId'] == image_params['threadId']
assert turns[-1]['message']['params']['sandboxPolicy']['type'] == 'readOnly'
assert any(e['run'] == turns[-1]['run'] and e['message']['params']['item'].get('text') == 'CODEX_RESTORED_ATTACHMENTS RIVER-4827 17' for e in completed)
result = {
    'date': '2026-10-21', 'originalVendorComponentsPreserved': True,
    'pi': {'nativeSessionId':view['ref']['nativeSessionId'], 'model':'gpt-6.1-sol', 'reasoning':'low',
           'imageBytesMatchFixture':True, 'attachmentReplyVerified':True, 'boundedEditExecuted':True,
           'shellDeniedWithoutOutput':True, 'finalApprovalMode':'manual',
           'sameNativeIdAfterRestore':True,
           'postRestoreRecall':'Latest live attempt failed upstream (fetch failed); history and configuration restored',
           'autoLiveTest':'Network fetch failed; aborted; not counted as passed',
           'lunaAttachmentAttempt':'Bytes delivered but model did not identify attachments; 6.1 Sol passed'},
    'codex': {'threadId':image_params['threadId'], 'model':'gpt-6-sol', 'reasoning':'medium',
              'imageBytesMatchFixture':True, 'attachmentReplyVerified':True,
              'workspaceWriteExitCode':0, 'writeWithoutEscalation':True, 'networkAccess':False,
              'sameThreadResumedInNewHost':True, 'resumedSandbox':'read-only',
              'restoredReply':'CODEX_RESTORED_ATTACHMENTS RIVER-4827 17',
              'fullAccessLiveTest':'Not run: isolated workspace authorization does not cover unsandboxed access'},
}
args.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
