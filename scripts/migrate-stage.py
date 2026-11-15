"""Stage only Doodle Tick private state from an unencrypted, offline HA backup.

Runs entirely on the HA machine. Never prints file contents, keys or hashes.
The app member name and data prefix must be checked against the actual backup.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import tarfile
import tempfile

MARKER = '.doodletick-migration.json'
MAX_BYTES = 2 * 1024 ** 3
MAX_FILES = 10000


def require(condition, message):
    if not condition:
        raise ValueError(message)


def regular_path(value, directory=False):
    path = Path(value)
    require(path.is_absolute(), 'Use absolute paths.')
    for item in [*reversed(path.parents), path]:
        info = item.lstat()
        require(not stat.S_ISLNK(info.st_mode), 'Linked paths are not allowed.')
    info = path.stat()
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), 'Unexpected input path type.')
    if not directory:
        require(info.st_nlink == 1, 'Linked backup files are not allowed.')
    return path.resolve()


def safe_parts(name):
    require('\\' not in name and '\x00' not in name, 'Unsafe archive path.')
    path = PurePosixPath(name)
    require(not path.is_absolute() and '..' not in path.parts, 'Unsafe archive path.')
    return path.parts


def flush_directory(path):
    if os.name != 'nt':
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def stage_backup(backup, member, data_prefix, destination, offline=False):
    require(offline is True, 'Stop the old app and disable automatic restart first.')
    backup = regular_path(backup)
    destination = Path(destination)
    require(destination.is_absolute() and destination.name == 'doodletick-migration', 'Use the target app configuration folder followed by doodletick-migration.')
    parent = regular_path(destination.parent, directory=True)
    destination = parent / destination.name
    require(not destination.exists() and not destination.is_symlink(), 'The migration destination already exists.')
    safe_parts(member)
    prefix = safe_parts(data_prefix)
    original = backup.stat()
    stage = None
    try:
        with tarfile.open(backup, mode='r:*') as outer:
            matches = [entry for entry in outer.getmembers() if entry.name == member]
            require(len(matches) == 1 and matches[0].isfile(), 'Select exactly one regular app archive member.')
            stage = Path(tempfile.mkdtemp(prefix='.doodletick-migration-stage-', dir=parent))
            stage.chmod(0o700)
            files, seen, roots, total = [], set(), set(), 0
            for name in ['keeper', 'tailscale']:
                (stage / name).mkdir(mode=0o700)
            with outer.extractfile(matches[0]) as stream, tarfile.open(fileobj=stream, mode='r|*') as inner:
                for entry in inner:
                    parts = safe_parts(entry.name)
                    if tuple(parts[:len(prefix)]) != tuple(prefix):
                        continue
                    relative = parts[len(prefix):]
                    if not relative or relative[0] not in ('keeper', 'tailscale'):
                        continue
                    require(all(part and all(c.isascii() and (c.isalnum() or c in '._-') for c in part) for part in relative), 'Unsupported private-state filename.')
                    roots.add(relative[0])
                    name = '/'.join(relative)
                    target = stage.joinpath(*relative)
                    if entry.isdir():
                        target.mkdir(mode=0o700, parents=True, exist_ok=True)
                        continue
                    require(entry.isfile() and not entry.islnk() and not entry.issym(), 'Private state contains a link or special file.')
                    require(len(relative) > 1 and name not in seen, 'Duplicate or conflicting private-state entry.')
                    seen.add(name)
                    total += entry.size
                    require(entry.size >= 0 and total <= MAX_BYTES and len(seen) <= MAX_FILES, 'Private state exceeds the reviewed staging limits.')
                    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    digest, written = hashlib.sha256(), 0
                    with inner.extractfile(entry) as source, target.open('xb') as output:
                        target.chmod(0o600)
                        while chunk := source.read(1024 * 1024):
                            output.write(chunk)
                            digest.update(chunk)
                            written += len(chunk)
                        output.flush()
                        os.fsync(output.fileno())
                    require(written == entry.size, 'An archive entry was incomplete.')
                    files.append({'name': name, 'bytes': written, 'sha256': digest.hexdigest()})
            require('keeper' in roots and 'keeper/witness-key.json' in seen, 'The selected app archive has no complete Doodle Tick data tree.')
            after = backup.stat()
            require((original.st_size, original.st_mtime_ns) == (after.st_size, after.st_mtime_ns), 'The backup changed during staging.')
            files.sort(key=lambda item: item['name'])
            for item in files:
                with (stage / item['name']).open('rb') as source:
                    require(hashlib.file_digest(source, 'sha256').hexdigest() == item['sha256'], 'Staged read-back failed.')
            with (stage / MARKER).open('x', encoding='utf-8') as output:
                (stage / MARKER).chmod(0o600)
                json.dump({'format': 'doodletick-offline-copy-v1', 'complete': True, 'files': files}, output, separators=(',', ':'))
                output.write('\n')
                output.flush()
                os.fsync(output.fileno())
            for directory in sorted((item for item in stage.rglob('*') if item.is_dir()), key=lambda item: len(item.parts), reverse=True):
                directory.chmod(0o700)
                flush_directory(directory)
            flush_directory(stage)
            require(not destination.exists() and not destination.is_symlink(), 'The migration destination appeared during staging.')
            stage.rename(destination)
            flush_directory(parent)
            return {'files': len(files), 'bytes': total, 'verified': True}
    except Exception:
        # Any incomplete private stage remains on HA for deliberate cleanup.
        # It is never named doodletick-migration and cannot trigger an import.
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup', required=True)
    parser.add_argument('--member', required=True, help='Exact app archive member, after inspecting names only')
    parser.add_argument('--data-prefix', required=True, help='Exact data directory prefix inside that app archive, usually data')
    parser.add_argument('--destination', required=True)
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(stage_backup(args.backup, args.member, args.data_prefix, args.destination, args.offline)))
    except Exception:
        parser.exit(1, 'Migration staging failed. Keep both apps stopped. Preserve the original app and backup; inspect the member name, data prefix, empty destination and private staging folder. No private data is printed.\n')


if __name__ == '__main__':
    main()
