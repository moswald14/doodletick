"""Disposable tar fixtures for the Node migration-stage tests. No live input."""
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile

module_file, root, kind = sys.argv[1:]
spec = importlib.util.spec_from_file_location('stage_tool', module_file)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
root = Path(root)
config = root / 'app-config'
config.mkdir()
destination = config / 'doodletick-migration'

entries = [
    ('data/keeper/witness-key.json', b'DISPOSABLE WITNESS FIXTURE'),
    ('data/keeper/garden-ledger.json', b'DISPOSABLE LEDGER FIXTURE'),
    ('data/keeper/receipts.jsonl', b'DISPOSABLE RECEIPT FIXTURE'),
    ('data/tailscale/tailscaled.state', b'DISPOSABLE VPN FIXTURE'),
    ('data/options.json', b'OPTIONS MUST NOT BE IMPORTED'),
    ('addon.json', b'BACKUP METADATA MUST NOT BE IMPORTED')
]
if kind == 'traversal':
    entries.append(('data/keeper/../../outside', b'UNSAFE FIXTURE'))
if kind == 'duplicate':
    entries.append(entries[0])
if kind == 'missing-vpn':
    entries = [entry for entry in entries if 'tailscale' not in entry[0]]
if kind == 'missing-witness':
    entries = [entry for entry in entries if 'witness-key' not in entry[0]]

inner = io.BytesIO()
with tarfile.open(fileobj=inner, mode='w:gz') as archive:
    for name, content in entries:
        entry = tarfile.TarInfo(name)
        entry.size = len(content)
        archive.addfile(entry, io.BytesIO(content))
    if kind == 'link':
        entry = tarfile.TarInfo('data/keeper/linked-key')
        entry.type = tarfile.SYMTYPE
        entry.linkname = '/outside'
        archive.addfile(entry)
backup = root / 'fixture-backup.tar'
with tarfile.open(backup, mode='w') as archive:
    entry = tarfile.TarInfo('local_fixture.tar.gz')
    data = inner.getvalue()
    entry.size = len(data)
    archive.addfile(entry, io.BytesIO(data))

if kind == 'existing':
    destination.mkdir()
    (destination / 'keep.txt').write_text('KEEP FIXTURE', encoding='utf-8')
try:
    result = module.stage_backup(str(backup), 'local_fixture.tar.gz', 'data', str(destination), kind != 'not-offline')
    print(json.dumps({'ok': True, **result}))
except ValueError:
    print(json.dumps({'ok': False, 'completedStage': (destination / module.MARKER).exists()}))
