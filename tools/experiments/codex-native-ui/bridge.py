"""Local, single-client proof of concept. Vendor assets are NOT redistributed."""
import argparse
import base64
import hmac
import json
import os
from pathlib import Path
import queue
import secrets
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from mimetypes import guess_type
from urllib.parse import urlsplit, parse_qs
from storage import HostStorage
from attachments import Attachments
import provider

HERE = Path(__file__).parent
READ_METHODS = {
    'account/read', 'account/rateLimits/read', 'config/read',
    'configRequirements/read', 'model/list', 'collaborationMode/list',
    'experimentalFeature/list', 'mcpServerStatus/list', 'plugin/installed',
    'skills/list', 'hooks/list', 'thread/list', 'thread/loaded/list', 'getAuthStatus',
}
THREAD_METHODS = {'thread/read', 'thread/resume', 'thread/name/set',
                  'thread/turns/list', 'thread/items/list', 'thread/goal/get',
                  'turn/start', 'turn/interrupt', 'turn/steer'}


def redact(value):
    if isinstance(value, dict):
        return {k: '[redacted]' if any(s in k.lower() for s in ('token', 'email', 'secret', 'apikey', 'accountid', 'userid'))
                else redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


class Runtime:
    def __init__(self, args):
        self.args = args
        self.pending = {}
        self.approvals = {}
        self.permission_grants = {}
        self.attachments = Attachments(args.home)
        self.storage = HostStorage(args.home, args.cwd)
        saved = self.storage.load()
        self.threads = set(saved['threads'])
        self.events = []
        self.condition = threading.Condition()
        self.write_lock = threading.Lock()
        self.trace_lock = threading.Lock()
        self.handle_lock = threading.RLock()
        project = {'id': 'native-ui-probe', 'name': 'Isolated UI probe',
                   'rootPaths': [str(args.cwd)], 'createdAt': 1, 'updatedAt': 1}
        self.state = {**saved['state'], 'local-projects': {project['id']: project},
                      'selected-project': {'type': 'local', 'projectId': project['id']},
                      'viewed2025-09-15-nux': True}
        self.atoms = {'recent-tasks-filter': 'local', **saved['atoms']}
        # Preferences are not durable authorization. Start each host read-only.
        if getattr(args, 'canvas_host', False):
            self.atoms['permission-selection-by-host-id:local'] = {'kind':'agent-mode', 'agentMode':'read-only'}
            self.atoms['agent-mode-by-host-id'] = {'local':'read-only'}
        self.capn_sessions = {}
        self.token = secrets.token_urlsafe(32)
        self.origin = f'http://127.0.0.1:{args.port}'
        args.evidence.mkdir(parents=True, exist_ok=True)
        self.trace = (args.evidence / 'trace.jsonl').open('x')
        env = {k: v for k, v in os.environ.items() if k in
               {'PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'SHELL',
                'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
                'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
                'SSL_CERT_FILE', 'SSL_CERT_DIR'}}
        env['CODEX_HOME'] = str(args.home)
        flags = ['sandbox_mode="read-only"', 'approval_policy="on-request"',
                 'approvals_reviewer="user"', 'web_search="disabled"',
                 'analytics.enabled=false', 'features.multi_agent=false']
        self.provider_models = None
        if getattr(args, 'provider', 'chatgpt') == provider.PROVIDER:
            if (args.home / 'auth.json').exists() or (args.home / 'auth.json').is_symlink():
                raise ValueError('Custom provider requires a separate home without ChatGPT auth')
            credential, self.provider_models = provider.credentials_and_models()
            env[provider.ENV_KEY] = credential
            flags += provider.flags()
            del credential
        command = [str(args.codex), 'app-server', '--listen', 'stdio://']
        for flag in flags:
            command += ['-c', flag]
        self.stderr = (args.evidence / 'server-stderr.log').open('x')
        self.process = subprocess.Popen(command, cwd=args.cwd, env=env,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.stderr, text=True, bufsize=1)
        env.pop(provider.ENV_KEY, None)
        threading.Thread(target=self.read_loop, daemon=True).start()
        result = self.call('initialize', {
            'clientInfo': {'name': 'agent_canvas_native_ui_probe', 'title': 'Isolated native UI probe', 'version': '0.1.0'},
            'capabilities': {'experimentalApi': True},
        })
        if 'error' in result:
            self.close()
            raise RuntimeError(result['error'])
        self.write({'method': 'initialized'})

    def save(self):
        self.storage.save(self.threads, self.state, self.atoms)

    def log(self, direction, value):
        with self.trace_lock:
            self.trace.write(json.dumps({'time': time.time(), 'direction': direction,
                                         'message': redact(value)}) + '\n')
            self.trace.flush()

    def write(self, value):
        self.log('to-server', value)
        with self.write_lock:
            self.process.stdin.write(json.dumps(value) + '\n')
            self.process.stdin.flush()

    def call(self, method, params):
        ident = 'bridge-' + secrets.token_hex(8)
        inbox = queue.Queue()
        self.pending[ident] = inbox
        try:
            self.write({'id': ident, 'method': method, 'params': params})
            return inbox.get(timeout=60)
        except queue.Empty:
            return {'error': {'code': -32000, 'message': 'App-server request timed out'}}
        finally:
            self.pending.pop(ident, None)

    def emit(self, value):
        with self.condition:
            self.events.append(value)
            self.condition.notify_all()

    def read_loop(self):
        for line in self.process.stdout:
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            self.log('from-server', msg)
            if 'method' not in msg:
                inbox = self.pending.get(msg.get('id'))
                if inbox:
                    inbox.put(msg)
            elif 'id' in msg:
                self.approvals[str(msg['id'])] = msg
                self.emit({'type': 'mcp-request', 'hostId': 'local', 'request': msg})
            else:
                self.emit({'type': 'mcp-notification', 'hostId': 'local',
                           'method': msg['method'], 'params': msg.get('params')})

    def rpc(self, request):
        method = request['method']
        params = dict(request.get('params') or {})
        if method not in READ_METHODS | THREAD_METHODS | {'thread/start'}:
            raise ValueError('Unsupported in isolated probe: ' + method)
        if method in THREAD_METHODS and params.get('threadId') not in self.threads:
            raise ValueError('Thread does not belong to this probe')
        if method == 'getAuthStatus':
            params = {'includeToken': False, 'refreshToken': False}
        if method == 'thread/list':
            params['cwd'] = str(self.args.cwd)
        requested = dict(params)
        if method in {'thread/start', 'thread/resume'}:
            # Normalize safe defaults; Canvas expansion is checked below.
            params = {k: v for k, v in params.items() if k in
                      {'threadId', 'model', 'excludeTurns', 'initialTurnsPage'}}
            params.update(cwd=str(self.args.cwd), sandbox='read-only',
                          approvalPolicy='on-request', approvalsReviewer='user',
                          runtimeWorkspaceRoots=[str(self.args.cwd)])
            if method == 'thread/start':
                params.update(developerInstructions=(
                    'This is a narrowly scoped UI integration test. Do not inspect files, '
                    'credentials, other sessions or network resources. Do not delegate. '
                    'Only answer the test text or request the exact harmless printf command '
                    'the user specifies. If approval is denied, do not retry or work around it; '
                    'report the denial and finish.'), ephemeral=False)
                if getattr(self.args, 'canvas_host', False):
                    params['developerInstructions'] = (
                        'You are hosted in an Agent Canvas card. Work only on the user request '
                        'in the given workspace. Never inspect credentials or unrelated sessions. '
                        'If tool approval is denied, do not retry or work around it. '
                        'The host supports individual execution approval, not session-wide grants.')
        if method == 'turn/start':
            params = {k: v for k, v in params.items() if k in
                      {'threadId', 'input', 'model', 'clientUserMessageId', 'effort'}}
            params.update(cwd=str(self.args.cwd), approvalPolicy='on-request',
                          approvalsReviewer='user', sandboxPolicy={'type': 'readOnly'})
            if not getattr(self.args, 'canvas_host', False):
                params['effort'] = 'low'
        if getattr(self.args, 'canvas_host', False) and method in {'thread/start','thread/resume','turn/start'}:
            sandbox = requested.get('sandboxPolicy') or {}
            if not isinstance(sandbox, dict):
                raise ValueError('Invalid sandbox policy')
            selection = self.atoms.get('permission-selection-by-host-id:local') or {}
            mode = selection.get('agentMode', 'read-only') if selection.get('kind', 'agent-mode') == 'agent-mode' else 'unsupported'
            selected_policy = {'read-only':'readOnly','auto':'workspaceWrite','full-access':'dangerFullAccess'}.get(mode)
            policy = sandbox.get('type') or ({'read-only':'readOnly','workspace-write':'workspaceWrite','danger-full-access':'dangerFullAccess'}.get(requested['sandbox']) if requested.get('sandbox') else selected_policy)
            collaboration = requested.get('collaborationMode')
            if collaboration is not None:
                if not isinstance(collaboration, dict) or collaboration.get('mode') != 'default':
                    raise ValueError('Only default collaboration mode is connected')
                settings = collaboration.get('settings') or {}
                if not isinstance(settings, dict):
                    raise ValueError('Invalid collaboration settings')
                # The official composer stores its model/effort here and sends
                # null top-level fields. Never substitute a different model.
                if settings.get('model'):
                    params['model'] = settings['model']
                if method == 'turn/start' and settings.get('reasoning_effort'):
                    params['effort'] = settings['reasoning_effort']
            if policy not in {'readOnly','workspaceWrite','dangerFullAccess'}:
                raise ValueError('Unsupported sandbox policy')
            owner = requested.get('threadId', '__new__')
            if policy != 'readOnly' and getattr(self, 'permission_grants', {}).get(owner) != policy:
                raise ValueError('Permission expansion requires host confirmation for this running session')
            if policy == 'readOnly':
                getattr(self, 'permission_grants', {}).pop(owner, None)
            params['approvalPolicy'] = 'never' if policy == 'dangerFullAccess' else 'on-request'
            params['approvalsReviewer'] = 'user'
            if method == 'turn/start':
                params['sandboxPolicy'] = {'type':policy}
                if policy == 'workspaceWrite':
                    params['sandboxPolicy'].update(writableRoots=[str(self.args.cwd)], networkAccess=False, excludeTmpdirEnvVar=True, excludeSlashTmp=True)
            else:
                params['sandbox'] = {'readOnly':'read-only','workspaceWrite':'workspace-write','dangerFullAccess':'danger-full-access'}[policy]
                params['config'] = {'sandbox_workspace_write': {'writable_roots':[str(self.args.cwd)], 'network_access':False, 'exclude_tmpdir_env_var':True,'exclude_slash_tmp':True}}
        if method in {'turn/start','turn/steer'}:
            for item in params.get('input', []):
                if item.get('type') == 'localImage':
                    self.attachments.read(item['path'])
                elif item.get('type') == 'image':
                    url = item.get('url', '')
                    if not url.startswith(('data:image/png;base64,','data:image/jpeg;base64,','data:image/webp;base64,')) or len(url) > 3 * 1024 * 1024:
                        raise ValueError('Only bounded inline images are supported')
        if getattr(self, 'provider_models', None) is not None and method in {'thread/start','thread/resume','turn/start'}:
            model = params.get('model')
            if method == 'thread/start':
                model = model or provider.DEFAULT_MODEL
            if model is not None and model not in self.provider_models:
                raise ValueError('Model is not available from Singularity-X: ' + str(model))
            if model is not None:
                params['model'] = model
            else:
                # Let app-server retain the thread's selected model on restore.
                params.pop('model', None)
            if method != 'turn/start':
                params['modelProvider'] = 'singularity_x'
        result = self.call(method, params)
        if getattr(self, 'provider_models', None) is not None and method == 'model/list':
            result = provider.filter_models(result, self.provider_models)
        if method == 'account/read':
            # One read-only retry fits the Canvas proxy's 35-second deadline
            # when discovery itself times out after 15 seconds.
            for _ in range(1):
                if result.get('error', {}).get('message', '') not in {'workspace routing discovery failed', 'workspace routing discovery timed out'}:
                    break
                time.sleep(0.5)
                result = self.call(method, params)
        if method == 'thread/start' and 'result' in result:
            self.threads.add(result['result']['thread']['id'])
            self.save()
        if 'result' in result and method in {'thread/list', 'thread/loaded/list'}:
            # Preserve server pagination/filtering; never grant ownership just
            # because another session happens to exist in the dedicated home.
            result['result']['data'] = [entry for entry in result['result']['data']
                if (entry['id'] if isinstance(entry, dict) else entry) in self.threads]
        return {k: v for k, v in result.items() if k != 'id'}

    def host_fetch(self, url, body):
        key = url.removeprefix('vscode://codex/')
        if key in {'read-file-binary', 'read-file-metadata'}:
            data = self.attachments.read(body['path'])
            return {'contentsBase64':base64.b64encode(data).decode()} if key == 'read-file-binary' else {'sizeBytes':len(data), 'isDirectory':False}
        if key == 'account-info':
            result = self.rpc({'method':'account/read','params':{}})['result']
            account = result.get('account') or {}
            return {'accountId': None, 'userId': None, 'plan': account.get('planType'),
                    'email': None, 'computeResidency': None,
                    'hasChatGptToken': account.get('type') == 'chatgpt'}
        values = {
            'get-settings': {'values': {}, 'configuredValues': {}},
            'os-info': {'platform': 'darwin', 'osVersion': 'isolated-probe', 'isVsCodeRunningInsideWsl': False},
            'is-copilot-api-available': {'available': False},
            'openai-api-key': {'value': None},
            'codex-home': {'codexHome': str(self.args.home), 'workspacesRoot': None, 'worktreesSegment': None},
            'workspace-root-options': {'roots': [str(self.args.cwd)]},
            'locale-info': {'ideLocale': 'en', 'systemLocale': 'en-US'},
            'list-pinned-threads': {'threadIds': []},
            'get-copilot-api-proxy-info': None,
            'has-custom-cli-executable': {'hasCustomCliExecutable': True},
            'list-automations': {'items': []},
            'git-origins': {'origins': [], 'homeDir': str(self.args.home)},
            'mcp-codex-config': {'config': None},
            'worktree-shell-environment-config': {'shellEnvironment': None},
        }
        if key in values:
            return values[key]
        if key == 'get-global-state':
            return {'value': self.state.get(body.get('key'))}
        if key == 'get-setting':
            if body.get('key') == 'followUpQueueMode':
                return {'value': 'queue'}
            raise ValueError('Setting not connected: ' + str(body.get('key')))
        if key == 'set-global-state':
            self.state[body['key']] = body.get('value')
            self.save()
            return {'success': True}
        if key == 'set-vs-context':
            self.state['context:' + body['key']] = body.get('value')
            return {'success': True}
        if key == 'developer-instructions':
            return {'instructions': body.get('baseInstructions') or ''}
        raise ValueError('Host feature not connected: ' + key)

    def handle(self, msg):
        with self.handle_lock:
            self._handle(msg)

    def _handle(self, msg):
        self.log('from-ui', msg)
        kind = msg.get('type')
        if kind == 'canvas-confirm-permissions':
            if not getattr(self.args, 'canvas_host', False) or msg.get('threadId') not in self.threads | {'__new__'} or msg.get('policy') not in {'workspaceWrite','dangerFullAccess'}:
                raise ValueError('Invalid permission confirmation')
            self.permission_grants[msg['threadId']] = msg['policy']
        elif kind == 'mcp-request':
            req = msg['request']
            try:
                result = self.rpc(req)
            except (ValueError, KeyError, TypeError, AttributeError) as error:
                result = {'error': {'code': -32601, 'message': str(error)}}
            self.emit({'type': 'mcp-response', 'hostId': 'local',
                       'message': {'id': req['id'], **result}})
        elif kind == 'mcp-response':
            response = msg['response']
            pending = self.approvals.get(str(response['id']))
            if not pending:
                raise ValueError('Unknown approval request')
            decision = response.get('result', {}).get('decision')
            allowed = {'decline', 'cancel'}
            if (getattr(self.args, 'canvas_host', False) and pending['method'] in
                    {'item/commandExecution/requestApproval', 'item/fileChange/requestApproval'}):
                allowed.add('accept')
            if not isinstance(decision, str) or decision not in allowed:
                raise ValueError('Only deny/cancel or an explicit one-time execution approval is supported')
            # Never forward permission grants, policy amendments or session grants.
            self.write({'id': pending['id'], 'result': {'decision': decision}})
            del self.approvals[str(response['id'])]
        elif kind == 'fetch':
            reply = {'type': 'fetch-response', 'requestId': msg['requestId']}
            try:
                value = self.host_fetch(msg['url'], json.loads(msg.get('body') or '{}'))
                reply.update(responseType='success', status=200, headers={}, bodyJsonString=json.dumps(value))
            except (ValueError, KeyError, TypeError, AttributeError) as error:
                reply.update(responseType='error', status=501, error=str(error))
            self.emit(reply)
        elif kind == 'persisted-atom-sync-request':
            self.emit({'type': 'persisted-atom-sync', 'state': self.atoms})
        elif kind == 'persisted-atom-update':
            if msg.get('deleted'):
                self.atoms.pop(msg['key'], None)
            elif 'recordUpdate' in msg:
                current = dict(self.atoms.get(msg['key']) or {})
                for key, update in msg['recordUpdate'].get('entries', {}).items():
                    if update.get('delete') or update.get('deleted'):
                        current.pop(key, None)
                    else:
                        current[key] = update.get('value')
                self.atoms[msg['key']] = current
            else:
                self.atoms[msg['key']] = msg.get('value')
            self.save()
            self.emit({'type': 'persisted-atom-updated', 'key': msg['key'],
                       'value': self.atoms.get(msg['key']), 'deleted': bool(msg.get('deleted'))})
        elif kind == 'shared-object-subscribe':
            empty_lists = {'pending_worktrees', 'remote_ssh_connections', 'remote_wsl_connections',
                           'remote_control_connections'}
            value = [] if msg['key'] in empty_lists else None
            self.emit({'type': 'shared-object-updated', 'key': msg['key'], 'value': value})
        elif kind == 'vscode-capn-rpc-connect':
            # A refresh gets a fresh event cursor, not old turns replayed into
            # the UI. Outstanding approvals are the exception and remain live.
            for pending in list(self.approvals.values()):
                self.emit({'type': 'mcp-request', 'hostId': 'local', 'request': pending})
        elif kind == 'vscode-capn-rpc-message':
            # Minimal subset of the observed capability protocol, not a general
            # implementation. Export 100 is our in-memory project membership service.
            session = self.capn_sessions.setdefault(msg['sessionId'], {'count': 0, 'results': {}})
            wire = msg['message']
            if wire[0] == 'push':
                session['count'] += 1
                expr = wire[1]
                if expr == ['pipeline', 0, ['services']]:
                    value = {'threadProjectAssignments': ['export', 100]}
                elif expr[:3] == ['pipeline', 100, ['setMembership']]:
                    data = expr[3][0]
                    if data['threadId'] not in self.threads:
                        raise ValueError('Cannot assign foreign thread')
                    assignments = self.state.setdefault('thread-project-assignments', {})
                    if data.get('assignment') is None:
                        assignments.pop(data['threadId'], None)
                    else:
                        assignments[data['threadId']] = data['assignment']
                    projectless = set(self.state.get('projectless-thread-ids') or [])
                    if data.get('projectless'):
                        projectless.add(data['threadId'])
                    else:
                        projectless.discard(data['threadId'])
                    self.state['projectless-thread-ids'] = list(projectless)
                    self.save()
                    value = None
                else:
                    raise ValueError('Unsupported capability expression')
                session['results'][session['count']] = value
            elif wire[0] == 'pull' and wire[1] in session['results']:
                self.emit({'type': kind, 'sessionId': msg['sessionId'],
                           'message': ['resolve', wire[1], session['results'][wire[1]]]})
                if wire[1] == 1:
                    session['count'] = max(100, session['count'])
        elif kind == 'worker-request':
            req = msg['request']
            if msg['workerId'] == 'git' and req['method'] in {'availability', 'stable-metadata'}:
                result = {'type': 'ok', 'value': {'available': False} if req['method'] == 'availability' else None}
            else:
                result = {'type': 'error', 'error': {'message': 'Worker feature not connected in probe'}}
            self.emit({'type': 'worker-response', 'workerId': msg['workerId'],
                       'response': {'id': req['id'], 'method': req['method'], 'result': result}})

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.trace.close()
        self.stderr.close()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def authorized(self):
        runtime = self.server.runtime
        return (self.headers.get('Host') == urlsplit(runtime.origin).netloc
                and hmac.compare_digest(self.headers.get('X-Probe-Token', ''), runtime.token)
                and self.headers.get('Origin', runtime.origin) == runtime.origin)

    def send_data(self, data, content_type='application/json', status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        parents = ' '.join(getattr(self.server.runtime.args, 'parent_origin', []))
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self'; frame-ancestors 'self' " + parents + "; object-src 'none'; form-action 'none'; base-uri 'self'")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        runtime = self.server.runtime
        if self.headers.get('Host') != urlsplit(runtime.origin).netloc:
            self.send_error(403)
            return
        url = urlsplit(self.path)
        if url.path == '/events':
            if not self.authorized():
                self.send_error(403)
                return
            after = max(0, int(parse_qs(url.query).get('after', ['0'])[0]))
            with runtime.condition:
                if len(runtime.events) <= after:
                    runtime.condition.wait(timeout=15)
                value = {'cursor': len(runtime.events), 'messages': runtime.events[after:]}
            self.send_data(json.dumps(value).encode())
        elif url.path == '/ui/':
            # One active renderer lease per card. Refreshing invalidates the old
            # view, rather than letting two clients interleave Cap'n RPC traffic.
            if getattr(runtime.args, 'canvas_host', False):
                with runtime.handle_lock:
                    runtime.token = secrets.token_urlsafe(32)
                    runtime.capn_sessions.clear()
            html = (runtime.args.webview / 'index.html').read_text()
            script = (HERE / 'host.js').read_text().replace('__PROBE_TOKEN__', json.dumps(runtime.token))
            script = script.replace('__PROBE_BASE__', json.dumps(getattr(runtime.args, 'base_path', '')))
            with runtime.condition:
                script = script.replace('__PROBE_CURSOR__', str(len(runtime.events)))
            html = html.replace('<head>', '<head><script>' + script + '</script>', 1)
            self.send_data(html.encode(), 'text/html; charset=utf-8')
        elif url.path == '/':
            self.send_data((HERE / 'card.html').read_bytes(), 'text/html; charset=utf-8')
        elif url.path.startswith('/ui/'):
            path = (runtime.args.webview / url.path.removeprefix('/ui/')).resolve()
            if not path.is_relative_to(runtime.args.webview) or not path.is_file():
                self.send_error(404)
                return
            self.send_data(path.read_bytes(), guess_type(path)[0] or 'application/octet-stream')
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path not in {'/bridge','/attachments'} or not self.authorized():
            self.send_error(403)
            return
        size = int(self.headers.get('Content-Length', '0'))
        if not 0 < size < 12 * 1024 * 1024:
            self.send_error(413)
            return
        try:
            msg = json.loads(self.rfile.read(size))
            if self.path == '/attachments':
                self.send_data(json.dumps(self.server.runtime.attachments.upload(msg.get('files'))).encode())
                return
            self.server.runtime.handle(msg)
            self.send_data(b'{"ok":true}')
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            self.send_data(json.dumps({'error': str(error)}).encode(), status=400)


def main():
    parser = argparse.ArgumentParser()
    for name in ('codex', 'webview', 'home', 'cwd', 'evidence'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--port', type=int, default=4392)
    parser.add_argument('--canvas-host', action='store_true')
    parser.add_argument('--provider', choices=['chatgpt', provider.PROVIDER], default='chatgpt')
    parser.add_argument('--base-path', default='')
    parser.add_argument('--parent-origin', action='append', default=[])
    args = parser.parse_args()
    if args.base_path and (not args.base_path.startswith('/native/codex/') or any(c in args.base_path for c in '?#\\\r\n')):
        parser.error('Invalid Canvas base path')
    for name in ('codex', 'webview', 'home', 'cwd', 'evidence'):
        setattr(args, name, getattr(args, name).resolve())
    if args.home == (Path.home() / '.codex').resolve() or (args.home / 'config.toml').exists():
        parser.error('Use a dedicated CODEX_HOME without config.toml, not your normal home')
    if any(args.cwd.iterdir()) and not args.canvas_host:
        parser.error('Use an empty test workspace')
    for origin in args.parent_origin:
        parsed = urlsplit(origin)
        if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1' or not parsed.port or parsed.path or parsed.query or parsed.fragment:
            parser.error('Parent origin must be an exact loopback HTTP origin')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    args.port = server.server_address[1]
    runtime = Runtime(args)
    try:
        server.runtime = runtime
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
        print(json.dumps({'url': runtime.origin, 'pid': runtime.process.pid}), flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        # The dev launcher and manager can both signal shutdown. Do not
        # interrupt cleanup halfway through closing the child runtime.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        runtime.close()
        server.server_close()


if __name__ == '__main__':
    main()
