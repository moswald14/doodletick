"""Build verified public release assets from this clean repository, using stdlib only."""
from pathlib import Path, PurePosixPath
import argparse
import gzip
import hashlib
import io
import json
import re
import subprocess
import tarfile
import zipfile


ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
BLOCKED_DIRS = {'.git', 'dist', '.doodletick', 'node_modules', '__pycache__', '.aws', '.codex', '.ssh', 'user-data', 'work', 'tmp', 'temp', '.cache'}
BLOCKED_NAMES = {'witness-key.json', 'garden-ledger.json', 'shelf-idle.json', 'receipts.jsonl', 'dvc-chain.jsonl', 'server.lock', 'tailscaled.state', 'id_rsa', 'id_ed25519'}
BLOCKED_SUFFIXES = ('.vault.json', '.doodletick-receipt.json', '.log', '.pem', '.key', '.pfx', '.exe', '.msi', '.scr', '.zip', '.tar', '.gz', '.tmp', '.bak')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def public_source():
    payloads = {}
    for candidate in sorted(ROOT.rglob('*')):
        relative = candidate.relative_to(ROOT)
        if any(part in BLOCKED_DIRS for part in relative.parts):
            continue
        require(not candidate.is_symlink(), 'Refusing a linked source path: ' + relative.as_posix())
        if not candidate.is_file():
            continue
        name = relative.as_posix()
        require(candidate.resolve().is_relative_to(ROOT), 'Source path escapes the repository.')
        require(candidate.name not in BLOCKED_NAMES and not candidate.name.startswith('.env')
                and not candidate.name.lower().endswith(BLOCKED_SUFFIXES), 'Private or generated artifact in source: ' + name)
        require(not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts, 'Unsafe archive path.')
        payloads[name] = candidate.read_bytes()
    return payloads


def make_zip(payloads):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(payloads.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 15, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = ((0o100755 if name.endswith('.sh') else 0o100644) << 16)
            archive.writestr(info, data)
    data = stream.getvalue()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        require(archive.testzip() is None, 'ZIP integrity failed.')
        require(archive.namelist() == sorted(payloads), 'ZIP inventory differs from expected source.')
        for name in payloads:
            require(archive.read(name) == payloads[name], 'ZIP content mismatch: ' + name)
    return data


def make_tar(payloads):
    stream = io.BytesIO()
    with gzip.GzipFile(fileobj=stream, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as archive:
            for name, data in sorted(payloads.items()):
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.mode = 0o755 if name.endswith('.sh') else 0o644
                entry.uid = entry.gid = entry.mtime = 0
                archive.addfile(entry, io.BytesIO(data))
    data = stream.getvalue()
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        require(archive.getnames() == sorted(payloads), 'Pi archive inventory differs from expected source.')
        for entry in archive:
            require(entry.isfile() and not entry.issym() and not entry.islnk(), 'Pi archive contains a non-regular file.')
            require(entry.mode == (0o755 if entry.name.endswith('.sh') else 0o644), 'Pi archive file mode mismatch.')
            require(archive.extractfile(entry).read() == payloads[entry.name], 'Pi archive content mismatch: ' + entry.name)
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', default='node', help='Node.js executable used for repository checks')
    parser.add_argument('--version', required=True, help='Expected public version; prevents packaging an unintended release')
    args = parser.parse_args()
    subprocess.run([args.node, 'scripts/check-repository.mjs'], cwd=ROOT, check=True)
    package = json.loads((ROOT / 'keeper/package.json').read_text(encoding='utf-8'))
    release = package['release']
    require(release == args.version and re.fullmatch(r'[0-9][0-9A-Za-z.-]*', release), 'The intended release does not match keeper/package.json.')
    bundle = json.loads((ROOT / 'keeper/pi/dependencies.json').read_text(encoding='utf-8'))['bundle']
    require(re.fullmatch(re.escape(release) + r'-pi\.[0-9]+', bundle), 'Invalid Pi bundle version.')
    require(not DIST.is_symlink(), 'dist must not be a symbolic link.')
    require(DIST.resolve().parent == ROOT, 'Release destination escapes the repository.')
    dist = DIST / release
    require(not dist.is_symlink() and dist.resolve().parent == DIST.resolve(), 'Versioned release destination escapes dist.')
    names = [f'doodletick-keeper-v{release}.zip', f'doodletick-pi-{bundle}.tar.gz', f'doodletick-home-assistant-{release}.zip']
    for name in names + ['SHA256SUMS']:
        require(not (dist / name).exists(), 'Release asset already exists; preserve it and use a new output directory/version: ' + name)
    source = public_source()
    require('LICENSE' in source, 'Missing GPL license.')
    notice_names = [name for name in ['THIRD_PARTY_NOTICES', 'THIRD_PARTY_NOTICES.md'] if name in source]
    require(len(notice_names) == 1, 'Exactly one THIRD_PARTY_NOTICES file is required.')
    keeper = {name[len('keeper/'):]: data for name, data in source.items() if name.startswith('keeper/')}
    # Ship corresponding Solidity source and its exact compiler inputs alongside
    # the browser's compiled deployment bytecode in every distribution.
    keeper.update({'contract-source/' + name[len('contracts/'):]: data for name, data in source.items() if name.startswith('contracts/')})
    # The wallet verifier ships its pinned build and corresponding dependency
    # sources in desktop and Pi archives as well as the full repository archive.
    keeper.update({'crypto-source/' + name[len('crypto-vendor/'):]: data for name, data in source.items() if name.startswith('crypto-vendor/')})
    for name in ['LICENSE', notice_names[0]]:
        require(name not in keeper or keeper[name] == source[name], 'Keeper and root license notices differ: ' + name)
        keeper[name] = source[name]
    require('SHA256SUMS' not in keeper, 'Remove stale checksum material from canonical source before packaging.')
    require(b'\r' not in keeper['pi/install.sh'], 'The Pi installer must retain LF line endings.')
    runtime = keeper['pi/runtime-files.txt'].decode('utf-8').splitlines()
    require(all(name in keeper for name in runtime), 'A Pi runtime file is missing from the payload.')
    desktop = {'doodletick-keeper/' + name: data for name, data in keeper.items()}
    sums = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n' for name, data in sorted(keeper.items()))
    pi = dict(desktop)
    pi['doodletick-keeper/SHA256SUMS'] = sums.encode('utf-8')
    require('repository.yaml' in source and 'doodletick/config.yaml' in source, 'Missing Home Assistant repository layout.')
    assets = {names[0]: make_zip(desktop), names[1]: make_tar(pi), names[2]: make_zip(source)}
    checksums = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n' for name, data in sorted(assets.items()))
    dist.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents overwriting an already delivered release.
    for name, data in {**assets, 'SHA256SUMS': checksums.encode('utf-8')}.items():
        with (dist / name).open('xb') as output:
            output.write(data)
        require((dist / name).read_bytes() == data, 'Written release file differs from the verified archive: ' + name)
    print(json.dumps({'release': release, 'sourceFiles': len(source), 'output': 'dist/' + release, 'assets': [
        {'name': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in sorted(assets.items())
    ]}, indent=2))


if __name__ == '__main__':
    main()
