"""Check extracted vendor assets without copying them into the project."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile


if __name__ == '__main__':
    archive_path, webview, output = map(Path, sys.argv[1:])
    with zipfile.ZipFile(archive_path) as archive:
        names = [n for n in archive.namelist()
                 if n.startswith('extension/webview/') and not n.endswith('/')]
        extracted = {p.relative_to(webview).as_posix() for p in webview.rglob('*') if p.is_file()}
        expected = {n.removeprefix('extension/webview/') for n in names}
        assert extracted == expected, 'Missing or extra Webview files'
        changed = [n for n in names if (webview / n.removeprefix('extension/webview/')).read_bytes()
                   != archive.read(n)]
        assert not changed, changed
    with archive_path.open('rb') as handle:
        digest = hashlib.file_digest(handle, 'sha256').hexdigest()
    result = {'webviewFilesVerified': len(names), 'modifiedFiles': changed, 'archiveSha256': digest}
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
