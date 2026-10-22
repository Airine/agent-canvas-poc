"""Size-limited browser uploads, owned by this card; never arbitrary host reads."""
import base64
import re
import secrets
from pathlib import Path


class Attachments:
    def __init__(self, home):
        self.root = Path(home) / 'canvas-attachments'
        if self.root.is_symlink():
            raise ValueError('Attachment directory must not be a symlink')
        self.root.mkdir(mode=0o700, exist_ok=True)
        self.root = self.root.resolve()

    def read(self, path):
        file = Path(path)
        if file.is_symlink() or file.resolve().parent != self.root or not file.is_file():
            raise ValueError('Attachment is not owned by this card')
        if file.stat().st_size > 2 * 1024 * 1024:
            raise ValueError('Attachment exceeds size limit')
        return file.read_bytes()

    def upload(self, files):
        if not isinstance(files, list) or not 0 < len(files) <= 4:
            raise ValueError('Select 1 to 4 files')
        validated = []
        text_bytes = 0
        for item in files:
            if not isinstance(item, dict) or not isinstance(item.get('data'), str) or len(item['data']) > 3 * 1024 * 1024:
                raise ValueError('Invalid attachment payload')
            data = base64.b64decode(item['data'], validate=True)
            mime = item.get('mimeType', '')
            if not data or not isinstance(mime, str):
                raise ValueError('Empty or invalid attachment')
            name = re.sub(r'[^\w. -]', '_', str(item.get('name', 'attachment.txt')))[:120]
            if mime.startswith('image/'):
                valid = (mime == 'image/png' and data.startswith(b'\x89PNG\r\n\x1a\n') or
                         mime == 'image/jpeg' and data.startswith(b'\xff\xd8\xff') and data.endswith(b'\xff\xd9') or
                         mime == 'image/webp' and data.startswith(b'RIFF') and data[8:12] == b'WEBP')
                if not valid or len(data) > 2 * 1024 * 1024:
                    raise ValueError('PNG/JPEG/WebP only, at most 2 MiB per image')
            else:
                text_bytes += len(data)
                if text_bytes > 100 * 1024 or b'\0' in data:
                    raise ValueError('Text attachment exceeds 100 KiB or is binary')
                data.decode('utf-8', errors='strict')
            validated.append((name, data))
        output = []
        for name, data in validated:
            file = self.root / (secrets.token_hex(16) + '-' + name)
            with file.open('xb') as stream:
                file.chmod(0o600); stream.write(data)
            output.append({'fsPath':str(file), 'path':str(file), 'label':name, 'isDirectory':False})
        return {'files':output}
