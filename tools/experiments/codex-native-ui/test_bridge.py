import json
from pathlib import Path
from types import SimpleNamespace
import unittest
import threading
from unittest.mock import Mock

from bridge import Runtime, redact


class BridgePolicyTests(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime.__new__(Runtime)
        self.runtime.args = SimpleNamespace(cwd=Path('/tmp/probe'), home=Path('/tmp/probe-home'))
        self.runtime.threads = {'owned'}
        self.runtime.approvals = {}
        self.runtime.capn_sessions = {}
        self.runtime.state = {}
        self.runtime.atoms = {}
        self.runtime.call = Mock(return_value={'result': {}})
        self.runtime.emit = Mock()
        self.runtime.write = Mock()
        self.runtime.log = Mock()
        self.runtime.save = Mock()
        self.runtime.handle_lock = threading.RLock()

    def test_auth_never_returns_token(self):
        self.runtime.rpc({'method': 'getAuthStatus', 'params': {'includeToken': True}})
        self.runtime.call.assert_called_once_with('getAuthStatus', {'includeToken': False, 'refreshToken': False})

    def test_unknown_methods_are_not_forwarded(self):
        with self.assertRaises(ValueError):
            self.runtime.rpc({'method': 'command/exec', 'params': {'command': ['sh']}})
        self.runtime.call.assert_not_called()

    def test_foreign_thread_rejected(self):
        with self.assertRaises(ValueError):
            self.runtime.rpc({'method': 'turn/start', 'params': {'threadId': 'foreign'}})
        self.runtime.call.assert_not_called()

    def test_turn_cannot_expand_permissions(self):
        self.runtime.rpc({'method': 'turn/start', 'params': {
            'threadId': 'owned', 'input': [], 'cwd': '/Users',
            'approvalPolicy': 'never', 'approvalsReviewer': 'auto_review',
            'sandboxPolicy': {'type': 'dangerFullAccess'}, 'permissions': 'full',
        }})
        params = self.runtime.call.call_args.args[1]
        self.assertEqual(params['sandboxPolicy'], {'type': 'readOnly'})
        self.assertEqual(params['approvalPolicy'], 'on-request')
        self.assertEqual(params['approvalsReviewer'], 'user')
        self.assertEqual(params['cwd'], '/tmp/probe')
        self.assertNotIn('permissions', params)

    def test_only_created_thread_becomes_owned(self):
        self.runtime.call.return_value = {'result': {'thread': {'id': 'new'}}}
        self.runtime.rpc({'method': 'thread/start', 'params': {'config': {'sandbox_mode': 'danger-full-access'}}})
        self.assertIn('new', self.runtime.threads)
        params = self.runtime.call.call_args.args[1]
        self.assertNotIn('config', params)
        self.assertFalse(params['ephemeral'])
        self.runtime.save.assert_called_once()

    def test_resume_preserves_history_options_but_not_overrides(self):
        self.runtime.rpc({'method': 'thread/resume', 'params': {
            'threadId': 'owned', 'path': '/foreign', 'history': [],
            'config': {'sandbox_mode': 'danger-full-access'}, 'excludeTurns': True,
            'initialTurnsPage': {'limit': 10}, 'sandbox': 'danger-full-access',
        }})
        params = self.runtime.call.call_args.args[1]
        self.assertEqual(params['sandbox'], 'read-only')
        self.assertTrue(params['excludeTurns'])
        self.assertEqual(params['initialTurnsPage'], {'limit': 10})
        for key in ('path', 'history', 'config'):
            self.assertNotIn(key, params)

    def test_lists_are_owned_only_and_keep_pagination(self):
        self.runtime.call.return_value = {'result': {
            'data': [{'id': 'foreign'}, {'id': 'owned'}], 'nextCursor': 'page-2'}}
        result = self.runtime.rpc({'method': 'thread/list', 'params': {'cwd': '/foreign'}})
        self.assertEqual(result['result']['data'], [{'id': 'owned'}])
        self.assertEqual(result['result']['nextCursor'], 'page-2')
        self.assertEqual(self.runtime.call.call_args.args[1]['cwd'], '/tmp/probe')
        self.runtime.call.return_value = {'result': {'data': ['owned', 'foreign']}}
        self.assertEqual(self.runtime.rpc({'method': 'thread/loaded/list'})['result']['data'], ['owned'])

    def test_foreign_history_reads_rejected(self):
        for method in ('thread/read', 'thread/resume', 'thread/turns/list', 'thread/items/list'):
            with self.assertRaises(ValueError):
                self.runtime.rpc({'method': method, 'params': {'threadId': 'foreign'}})
        self.runtime.call.assert_not_called()

    def test_atom_delete_and_global_state_are_persisted(self):
        self.runtime.atoms['drafts'] = {'one': 'draft'}
        self.runtime.handle({'type': 'persisted-atom-update', 'key': 'drafts',
                             'recordUpdate': {'entries': {'one': {'delete': True}}}})
        self.assertEqual(self.runtime.atoms['drafts'], {})
        self.runtime.host_fetch('vscode://codex/set-global-state', {'key': 'test', 'value': 1})
        self.assertEqual(self.runtime.save.call_count, 2)

    def test_approval_rejection_roundtrip(self):
        self.runtime.approvals['42'] = {'id': 42}
        self.runtime.handle({'type': 'mcp-response', 'response': {'id': 42, 'result': {'decision': 'decline'}}})
        self.runtime.write.assert_called_once_with({'id': 42, 'result': {'decision': 'decline'}})
        self.assertFalse(self.runtime.approvals)

    def test_approval_acceptance_disabled(self):
        self.runtime.approvals['42'] = {'id': 42}
        with self.assertRaises(ValueError):
            self.runtime.handle({'type': 'mcp-response', 'response': {'id': 42, 'result': {'decision': 'accept'}}})
        self.runtime.write.assert_not_called()
        self.assertIn('42', self.runtime.approvals)

    def test_canvas_accepts_only_one_time_execution_approval(self):
        self.runtime.args.canvas_host = True
        self.runtime.approvals['42'] = {'id': 42, 'method': 'item/commandExecution/requestApproval'}
        self.runtime.handle({'type': 'mcp-response', 'response': {'id': 42, 'result': {
            'decision': 'accept', 'permissions': {'network': True}, 'scope': 'session'}}})
        self.runtime.write.assert_called_once_with({'id': 42, 'result': {'decision': 'accept'}})
        with self.assertRaises(ValueError):
            self.runtime.handle({'type': 'mcp-response', 'response': {'id': 42, 'result': {'decision': 'accept'}}})

    def test_canvas_rejects_session_grants_and_permission_expansion(self):
        self.runtime.args.canvas_host = True
        for method, decision in [('item/commandExecution/requestApproval', 'acceptForSession'),
                                 ('item/commandExecution/requestApproval', {'acceptWithExecpolicyAmendment': {}}),
                                 ('item/permissions/requestApproval', 'accept')]:
            self.runtime.approvals['42'] = {'id': 42, 'method': method}
            with self.assertRaises(ValueError):
                self.runtime.handle({'type': 'mcp-response', 'response': {'id': 42, 'result': {'decision': decision}}})
        self.runtime.write.assert_not_called()

    def test_sensitive_trace_fields_redacted(self):
        result = redact({'nested': [{'authToken': 'secret', 'email': 'private', 'chatgptAccountId': 'private-id'}]})
        self.assertNotIn('secret', json.dumps(result))
        self.assertNotIn('private', json.dumps(result))

    def test_capability_membership_is_real_in_memory_state(self):
        def message(wire):
            self.runtime.handle({'type': 'vscode-capn-rpc-message', 'sessionId': 'session', 'message': wire})
        message(['push', ['pipeline', 0, ['services']]])
        message(['pull', 1])
        self.assertEqual(self.runtime.emit.call_args.args[0]['message'],
                         ['resolve', 1, {'threadProjectAssignments': ['export', 100]}])
        assignment = {'type': 'local', 'projectId': 'test'}
        message(['push', ['pipeline', 100, ['setMembership'],
                          [{'threadId': 'owned', 'assignment': assignment, 'projectless': False}]]])
        message(['pull', 101])
        self.assertEqual(self.runtime.state['thread-project-assignments']['owned'], assignment)
        self.assertEqual(self.runtime.emit.call_args.args[0]['message'], ['resolve', 101, None])

    def test_atom_record_updates_merge(self):
        self.runtime.atoms['drafts'] = {'first': {'text': 'one'}}
        self.runtime.handle({'type': 'persisted-atom-update', 'key': 'drafts',
                             'recordUpdate': {'entries': {'second': {'value': {'text': 'two'}}}}})
        self.assertEqual(set(self.runtime.atoms['drafts']), {'first', 'second'})


if __name__ == '__main__':
    unittest.main()
