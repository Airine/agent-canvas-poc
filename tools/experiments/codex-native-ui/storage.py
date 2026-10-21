"""Private host metadata only. App-server owns the actual conversation history."""
import json
import os
from pathlib import Path
import tempfile


class HostStorage:
    def __init__(self, home, cwd):
        self.path = Path(home) / 'native-ui-host.json'
        self.cwd = str(Path(cwd).resolve())

    def load(self):
        if not self.path.exists():
            return {'threads': [], 'state': {}, 'atoms': {}}
        data = json.loads(self.path.read_text())
        if data.get('version') != 1 or data.get('cwd') != self.cwd:
            raise ValueError('Host storage version/workspace mismatch; use a separate probe home')
        if (not isinstance(data.get('threads'), list)
                or not all(isinstance(value, str) for value in data['threads'])
                or not isinstance(data.get('state'), dict)
                or not isinstance(data.get('atoms'), dict)):
            raise ValueError('Invalid host storage; preserve the file for recovery')
        return data

    def save(self, threads, state, atoms):
        data = {'version': 1, 'cwd': self.cwd, 'threads': sorted(threads),
                'state': state, 'atoms': atoms}
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, temporary = tempfile.mkstemp(prefix='.native-ui-host-', dir=self.path.parent)
        try:
            with os.fdopen(fd, 'w') as output:
                json.dump(data, output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
            directory = os.open(self.path.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
