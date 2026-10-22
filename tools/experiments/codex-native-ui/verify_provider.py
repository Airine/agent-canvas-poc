"""Opt-in real-provider acceptance. Uses only synthetic data in a new workspace.

Runs the same host Runtime as Canvas, but is not a browser/UI acceptance test.
Credentials come only from Keychain; evidence contains no credentials.
"""
import argparse
import json
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace

from bridge import Runtime
from provider import DEFAULT_MODEL, PROVIDER


def rpc(runtime, method, params):
    result = runtime.rpc({'method': method, 'params': params})
    if 'error' in result:
        raise RuntimeError('RPC failed: ' + method)
    return result['result']


def turn(runtime, thread, prompt, deny=False):
    cursor = len(runtime.events)
    rpc(runtime, 'turn/start', {'threadId': thread, 'model': DEFAULT_MODEL,
        'effort': 'low', 'input': [{'type': 'text', 'text': prompt, 'text_elements': []}]})
    deadline = time.monotonic() + 180
    texts, commands, approvals = [], [], []
    while time.monotonic() < deadline:
        with runtime.condition:
            if cursor == len(runtime.events):
                runtime.condition.wait(timeout=1)
            batch = runtime.events[cursor:]
            cursor += len(batch)
        for event in batch:
            if event['type'] == 'mcp-request':
                request = event['request']
                approvals.append({'method': request['method'], 'decision': 'decline'})
                # Always deny: this probe never grants unsandboxed execution.
                runtime.handle({'type': 'mcp-response', 'response': {
                    'id': request['id'], 'result': {'decision': 'decline'}}})
            if event.get('method') == 'item/completed':
                item = event['params']['item']
                if item['type'] == 'agentMessage':
                    texts.append(item['text'])
                elif item['type'] == 'commandExecution':
                    commands.append({k: item.get(k) for k in ('status', 'exitCode', 'aggregatedOutput')})
            if event.get('method') == 'turn/completed':
                status = event['params']['turn']['status']
                assert status == 'completed', 'Real provider turn did not complete'
                if deny:
                    assert approvals, 'Expected a real app-server approval request'
                    assert not any(c['exitCode'] == 0 for c in commands), 'Denied command must not run'
                result = {'texts': texts, 'commands': commands, 'approvals': approvals, 'status': status}
                print(json.dumps(result), flush=True)
                return result
    raise TimeoutError('Provider acceptance turn timed out')


def verify(args):
    root = Path(tempfile.mkdtemp(prefix='singularity-x-', dir=args.private_root))
    home, cwd = root / 'home', root / 'workspace'
    home.mkdir(mode=0o700); cwd.mkdir(mode=0o700)
    common = dict(home=home, cwd=cwd, codex=args.codex, webview=args.webview,
                  canvas_host=True, provider=PROVIDER, port=0, base_path='', parent_origin=[])
    runtime = Runtime(SimpleNamespace(**common, evidence=root / 'before'))
    try:
        account = rpc(runtime, 'account/read', {})
        assert account.get('requiresOpenaiAuth') is False
        models = rpc(runtime, 'model/list', {})['data']
        assert models and all(m['model'] in runtime.provider_models for m in models)
        created = rpc(runtime, 'thread/start', {'model': DEFAULT_MODEL})
        thread = created['thread']['id']
        assert created['modelProvider'] == 'singularity_x'
        first = turn(runtime, thread,
            'Synthetic acceptance only. Remember marker SX_NATIVE_6824. Execute exactly '
            '`printf SX_NATIVE_6824` using your sandboxed shell, then repeat its output. '
            'Do not read files, credentials, environment variables, or network resources.')
        assert any(c['exitCode'] == 0 and c['aggregatedOutput'] == 'SX_NATIVE_6824' for c in first['commands'])
        denied = turn(runtime, thread,
            'Approval-path acceptance only: request execution of exactly `printf SX_DENIED_6824` '
            'using sandbox_permissions=require_escalated, with justification "Synthetic approval test". '
            'Do not run it without approval. If denied, do not retry, switch tools, or work around it; '
            'report the denial and stop. No file access.', deny=True)
        rpc(runtime, 'thread/name/set', {'threadId': thread, 'name': 'Singularity-X backend acceptance'})
    finally:
        runtime.close()
    runtime = Runtime(SimpleNamespace(**common, evidence=root / 'after'))
    try:
        listed = rpc(runtime, 'thread/list', {})
        assert any(t['id'] == thread for t in listed['data'])
        resumed = rpc(runtime, 'thread/resume', {'threadId': thread})
        assert resumed['thread']['id'] == thread
        assert resumed['modelProvider'] == 'singularity_x'
        assert 'SX_NATIVE_6824' in json.dumps(resumed)
        recalled = turn(runtime, thread,
            'Reply only with the remembered marker from the first sandboxed printf test. Do not use tools.')
        assert 'SX_NATIVE_6824' in '\n'.join(recalled['texts'])
        evidence = {'provider': PROVIDER, 'model': DEFAULT_MODEL, 'privateTraceRoot': str(root),
            'threadId': thread, 'chatgptAuthLinked': (home / 'auth.json').exists(),
            'keySource': 'macOS Keychain', 'realToolRoundTrip': True,
            'realApprovalDenied': bool(denied['approvals']), 'listedAfterRestart': True,
            'sameThreadResumed': True, 'markerRecalledAfterRestart': True,
            'nativeUIVerified': False, 'models': [m['model'] for m in models]}
        args.output.write_text(json.dumps(evidence, indent=2) + '\n')
        print(json.dumps(evidence), flush=True)
    finally:
        runtime.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('codex', 'webview', 'private-root', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    verify(parser.parse_args())
