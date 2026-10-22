"""Fixed, opt-in provider. Credentials never enter host RPC or renderer state."""
import json
import subprocess
import urllib.request

PROVIDER = 'singularity-x'
DEFAULT_MODEL = 'gpt-5.6-sol'
ENV_KEY = 'SINGULARITY_X_API_KEY'
BASE_URL = 'https://api.singularity-x.ai:9443/v1'
ACCOUNT = 'singularity-x'
SERVICE = 'agent-canvas-singularity-x-api-key'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        # Never send credentials to a redirect destination.
        return None


def credentials_and_models():
    try:
        result = subprocess.run(
            ['/usr/bin/security', 'find-generic-password', '-a', ACCOUNT, '-s', SERVICE, '-w'],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10, check=True)
        key = result.stdout.decode().strip()
        if not key or any(c.isspace() for c in key):
            raise ValueError('Invalid credential')
    except (OSError, ValueError, subprocess.SubprocessError):
        raise ValueError('Singularity-X Keychain credential unavailable') from None
    try:
        request = urllib.request.Request(BASE_URL + '/models', headers={'Authorization': 'Bearer ' + key})
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=12) as response:
            payload = json.loads(response.read(1024 * 1024))
        models = {item['id'] for item in payload['data'] if isinstance(item.get('id'), str)}
        if DEFAULT_MODEL not in models:
            raise ValueError('Default model unavailable')
        return key, models
    except Exception:
        # HTTP bodies/errors can contain upstream details; do not log them.
        raise ValueError('Singularity-X model discovery failed; no fallback provider was used') from None


def flags():
    return [
        'model_provider="singularity_x"', f'model="{DEFAULT_MODEL}"',
        'model_providers.singularity_x.name="Singularity-X"',
        f'model_providers.singularity_x.base_url="{BASE_URL}"',
        f'model_providers.singularity_x.env_key="{ENV_KEY}"',
        'model_providers.singularity_x.wire_api="responses"',
        'model_providers.singularity_x.requires_openai_auth=false',
        'model_providers.singularity_x.supports_websockets=false',
        # Do not propagate the API credential into agent-executed shell tools.
        f'shell_environment_policy.exclude=["{ENV_KEY}"]',
    ]


def filter_models(result, available):
    if 'result' not in result:
        return result
    data = result['result'].get('data', [])
    result['result']['data'] = [dict(item, isDefault=item.get('model') == DEFAULT_MODEL)
                              for item in data if item.get('model') in available]
    return result
