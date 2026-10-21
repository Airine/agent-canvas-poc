import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from storage import HostStorage


class HostStorageTests(unittest.TestCase):
    def test_roundtrip_private_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = HostStorage(directory, '/tmp/probe')
            self.assertEqual(storage.load()['threads'], [])
            storage.save({'owned'}, {'thread-project-assignments': {'owned': 'project'}},
                         {'recent-tasks-filter': 'local'})
            restored = HostStorage(directory, '/tmp/probe').load()
            self.assertEqual(restored['threads'], ['owned'])
            self.assertEqual(restored['atoms']['recent-tasks-filter'], 'local')
            self.assertEqual(restored['state']['thread-project-assignments']['owned'], 'project')
            self.assertEqual(storage.path.stat().st_mode & 0o777, 0o600)
            storage.save({'owned', 'second'}, {}, {})
            self.assertEqual(storage.load()['threads'], ['owned', 'second'])
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_bad_or_wrong_workspace_storage_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = HostStorage(directory, '/tmp/probe')
            storage.save({'owned'}, {}, {})
            with self.assertRaises(ValueError):
                HostStorage(directory, '/tmp/another').load()
            storage.path.write_text('not json')
            with self.assertRaises(json.JSONDecodeError):
                storage.load()
            self.assertEqual(storage.path.read_text(), 'not json')

    def test_failed_replace_keeps_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = HostStorage(directory, '/tmp/probe')
            storage.save({'original'}, {}, {})
            with patch('storage.os.replace', side_effect=OSError('disk error')):
                with self.assertRaises(OSError):
                    storage.save({'replacement'}, {}, {})
            self.assertEqual(storage.load()['threads'], ['original'])
            self.assertEqual(len(list(Path(directory).iterdir())), 1)
