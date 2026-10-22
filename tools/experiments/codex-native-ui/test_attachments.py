import base64
from pathlib import Path
import tempfile
import unittest
from attachments import Attachments


class AttachmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.files = Attachments(self.home)

    def test_selected_bytes_survive_restart_and_names_cannot_escape(self):
        result = self.files.upload([{'name':'../../note.txt','mimeType':'text/plain','data':base64.b64encode(b'RIVER-4827').decode()}])
        file = result['files'][0]['fsPath']
        self.assertEqual(Attachments(self.home).read(file), b'RIVER-4827')
        self.assertEqual(Path(file).parent, self.files.root)

    def test_foreign_symlink_and_oversize_rejected(self):
        foreign = self.home / 'private.txt'; foreign.write_text('private')
        link = self.files.root / 'alias.txt'; link.symlink_to(foreign)
        for file in [foreign, link]:
            with self.assertRaises(ValueError): self.files.read(file)
        for raw,mime in [(b'not png','image/png'),(b'\xff','text/plain'),(b'x'*102401,'text/plain'),(b'a\0b','text/plain')]:
            with self.assertRaises(ValueError): self.files.upload([{'name':'test','mimeType':mime,'data':base64.b64encode(raw).decode()}])

    def test_failed_batch_writes_nothing(self):
        with self.assertRaises(ValueError):
            self.files.upload([{'name':'ok.txt','data':'b2s='},{'name':'bad','data':'@@'}])
        self.assertEqual(list(self.files.root.iterdir()), [])

    def test_total_text_limit_and_malformed_inputs(self):
        for files in [[None], [{'data':''}], [{'data':1}], [{'data':'YQ==','mimeType':1}],
                      [{'data':base64.b64encode(b'x'*60000).decode()}]*2]:
            with self.assertRaises(ValueError): self.files.upload(files)
        self.assertEqual(list(self.files.root.iterdir()), [])

    def test_symlink_upload_root_rejected(self):
        other = self.home / 'other'; other.mkdir()
        (other / 'canvas-attachments').symlink_to(self.files.root)
        with self.assertRaises(ValueError): Attachments(other)
