import subprocess
import unittest
from unittest.mock import Mock, patch

import provider


class ProviderTests(unittest.TestCase):
    def test_flags_contain_only_key_reference_and_exclude_tool_env(self):
        flags = provider.flags()
        self.assertIn('model_provider="singularity_x"', flags)
        self.assertIn('model_providers.singularity_x.requires_openai_auth=false', flags)
        self.assertIn('shell_environment_policy.exclude=["SINGULARITY_X_API_KEY"]', flags)
        self.assertIn('model_providers.singularity_x.supports_websockets=false', flags)

    def test_model_list_intersects_real_provider_catalog(self):
        result = {'result': {'data': [
            {'model': 'gpt-6.1-sol', 'isDefault': True},
            {'model': provider.DEFAULT_MODEL, 'supportedReasoningEfforts': ['low']}], 'nextCursor': None}}
        filtered = provider.filter_models(result, {provider.DEFAULT_MODEL, 'not-in-codex'})
        self.assertEqual(filtered['result']['data'], [
            {'model': provider.DEFAULT_MODEL, 'isDefault': True, 'supportedReasoningEfforts': ['low']}])
        self.assertIsNone(filtered['result']['nextCursor'])

    def test_redirects_never_forward_authorization(self):
        self.assertIsNone(provider.NoRedirect().redirect_request(None, None, 302, None, None, 'https://other.invalid'))

    @patch('provider.subprocess.run')
    def test_missing_key_fails_closed_without_subprocess_output(self, run):
        run.side_effect = subprocess.CalledProcessError(1, 'security', output='secret')
        with self.assertRaisesRegex(ValueError, '^Singularity-X Keychain credential unavailable$'):
            provider.credentials_and_models()

    @patch('provider.urllib.request.build_opener')
    @patch('provider.subprocess.run')
    def test_only_fixed_endpoint_and_keychain_reference_are_used(self, run, opener):
        run.return_value = Mock(stdout=b'test-only-credential\n')
        response = opener.return_value.open.return_value.__enter__.return_value
        response.read.return_value = b'{"data":[{"id":"gpt-5.6-sol"}]}'
        credential, models = provider.credentials_and_models()
        self.assertEqual(credential, 'test-only-credential')
        self.assertEqual(models, {provider.DEFAULT_MODEL})
        self.assertEqual(opener.return_value.open.call_args.args[0].full_url, provider.BASE_URL + '/models')
        self.assertNotIn(credential, repr(run.call_args))

    @patch('provider.urllib.request.build_opener')
    @patch('provider.subprocess.run')
    def test_discovery_error_does_not_echo_provider_body(self, run, opener):
        run.return_value = Mock(stdout=b'test-only-credential')
        opener.return_value.open.side_effect = ValueError('test-only-credential')
        with self.assertRaisesRegex(ValueError, '^Singularity-X model discovery failed; no fallback provider was used$'):
            provider.credentials_and_models()


if __name__ == '__main__':
    unittest.main()
