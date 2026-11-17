"""Build a self-contained Windows GPU miner from verified offline inputs."""
# SPDX-License-Identifier: GPL-3.0-only
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import importlib.util
import io
import json
import re
import stat
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_zip_entries(archive, maximum_size=1_500_000_000):
    names = set()
    total = 0
    for item in archive.infolist():
        name = item.filename.rstrip('/')
        relative = PurePosixPath(name)
        require(name and not relative.is_absolute() and '\\' not in name and ':' not in name
                and not any(part in ('', '.', '..') for part in name.split('/')), 'Unsafe input archive path.')
        require(name not in names, 'Duplicate input archive path.')
        names.add(name)
        require(not stat.S_ISLNK(item.external_attr >> 16), 'Input archives may not contain symbolic links.')
        total += item.file_size
        require(total <= maximum_size and item.file_size <= 400_000_000, 'Input archive exceeds package bounds.')
    return names


def core_payload(archive_path, manifest_path, expected_archive_hash, chain, patch_hash):
    data = archive_path.read_bytes()
    require(re.fullmatch('[0-9a-f]{64}', expected_archive_hash) and digest(data) == expected_archive_hash,
            'Core archive does not match the supplied verified digest.')
    manifest_data = manifest_path.read_bytes()
    manifest = json.loads(manifest_data)
    require(manifest['product'] == 'Doodleverse Core experimental' and manifest['platform'] == 'windows-x86_64', 'Wrong native package.')
    require(manifest['upstreamCommit'] == chain['upstream']['commit'] and manifest['patchSha256'] == patch_hash,
            'Rebuild Core: its source patch differs from this release.')
    expected = manifest['filesSha256']
    require(isinstance(expected, dict) and 1 <= len(expected) <= 2000, 'Invalid native manifest.')
    prefix = 'doodleverse-core-experimental-windows-x86_64/'
    result = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        safe_zip_entries(archive)
        files = {item.filename[len(prefix):]: item for item in archive.infolist() if not item.is_dir() and item.filename.startswith(prefix)}
        require(len(files) == len([item for item in archive.infolist() if not item.is_dir()]), 'Native package has an unexpected root.')
        require(set(files) == set(expected) | {'manifest.json'}, 'Native package inventory differs from its manifest.')
        require(archive.read(files['manifest.json']) == manifest_data, 'Native manifest differs from the verified archive.')
        for name, item in files.items():
            content = archive.read(item)
            if name != 'manifest.json':
                require(digest(content) == expected[name], 'Native file hash mismatch: ' + name)
            require(PurePosixPath(name).name not in {'.cookie', 'wallet.dat', 'debug.log', 'doodleverse.conf'}, 'Runtime data in native package.')
            result['core/' + name] = content
    require(json.loads(result['core/chain-manifest.json']) == chain, 'Native chain identity differs from this app.')
    return result, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', required=True)
    parser.add_argument('--core-package', type=Path, required=True)
    parser.add_argument('--core-manifest', type=Path, required=True)
    parser.add_argument('--core-sha256', required=True, help='Verified inner native ZIP SHA-256')
    parser.add_argument('--node-input', type=Path, required=True, help='Official archive, signed checksums and public release key folder')
    parser.add_argument('--output', type=Path, required=True, help='New output directory; never overwritten')
    parser.add_argument('--node', default='node')
    parser.add_argument('--allow-working-tree', action='store_true', help='Developer smoke package only; marked unreleased')
    args = parser.parse_args()
    release = json.loads((ROOT / 'keeper/package.json').read_text())['release']
    require(release == args.version and re.fullmatch('[0-9][0-9A-Za-z.-]*', release), 'Unexpected package version.')
    head = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    require(re.fullmatch('[0-9a-f]{40}', head), 'Cannot identify the source commit.')
    dirty = bool(subprocess.check_output(['git', '-C', str(ROOT), 'status', '--porcelain'], text=True).strip())
    require(not dirty or args.allow_working_tree, 'Commit the reviewed source before building a distributable package.')
    if not args.allow_working_tree:
        subprocess.run([args.node, 'scripts/check-repository.mjs'], cwd=ROOT, check=True)
    chain = json.loads((ROOT / 'doodleverse-core/chain-manifest.json').read_text())
    patch_hash = digest((ROOT / 'doodleverse-core/patches/doodleverse.patch').read_bytes())
    files, native_manifest = core_payload(args.core_package.resolve(), args.core_manifest.resolve(), args.core_sha256, chain, patch_hash)
    runtime = json.loads((HERE / 'node-runtime.json').read_text())
    runtime_archive = args.node_input / runtime['archive']
    node_bytes = runtime_archive.read_bytes()
    require(digest(node_bytes) == runtime['sha256'], 'Node runtime archive checksum mismatch.')
    node_prefix = 'node-v' + runtime['version'] + '-win-x64/'
    with zipfile.ZipFile(io.BytesIO(node_bytes)) as archive:
        safe_zip_entries(archive, maximum_size=400_000_000)
        for name in ['node.exe', 'LICENSE', 'README.md', 'CHANGELOG.md']:
            files['runtime/' + name] = archive.read(node_prefix + name)
    for name, field in [('SHASUMS256.txt', 'checksumsSha256'), ('SHASUMS256.txt.sig', 'signatureSha256'), ('node-release-key.asc', 'signingKeySha256')]:
        content = (args.node_input / name).read_bytes()
        require(digest(content) == runtime[field], 'Node signature provenance changed: ' + name)
        files['provenance/node/' + name] = content
    files['provenance/node-runtime.json'] = (HERE / 'node-runtime.json').read_bytes()
    require((runtime['sha256'] + '  ' + runtime['archive']).encode() in files['provenance/node/SHASUMS256.txt'], 'Official checksum record does not name this runtime.')

    spec = importlib.util.spec_from_file_location('dvc_public_release', ROOT / 'scripts/package-release.py')
    release_helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(release_helper)
    source = release_helper.public_source()
    runtime_names = (ROOT / 'keeper/pi/runtime-files.txt').read_text().splitlines()
    require(all('keeper/' + name in source for name in runtime_names), 'Incomplete Keeper runtime inventory.')
    for name in runtime_names:
        if not name.startswith('pi/'):
            files['keeper/' + name] = source['keeper/' + name]
    for name in ['launcher.mjs', 'Start-Doodleverse.cmd', 'Stop-Doodleverse.cmd', 'README.md']:
        files[name] = (HERE / name).read_bytes()
    files['app/core-process.mjs'] = (ROOT / 'doodletick/core-process.mjs').read_bytes()
    files['app/core-source/chain-manifest.json'] = (ROOT / 'doodleverse-core/chain-manifest.json').read_bytes()
    files['source/doodletick-source.zip'] = release_helper.make_zip(source)
    files['LICENSE'] = source['LICENSE']
    files['THIRD_PARTY_NOTICES.md'] = source['THIRD_PARTY_NOTICES.md']
    files['miner-settings.json'] = (json.dumps({'network': 'main' if chain['mainnet_ready'] else 'regtest', 'peers': []}, indent=2) + '\n').encode()
    label = release + ('-working-test' if args.allow_working_tree else '')
    manifest = {
        'schema': 1, 'product': 'Doodleverse Windows GPU miner', 'platform': 'win-x64', 'release': label,
        'sourceCommit': head, 'unreleasedWorkingTree': args.allow_working_tree, 'nativeUpstreamCommit': native_manifest['upstreamCommit'],
        'nativePatchSha256': patch_hash, 'nodeVersion': runtime['version'], 'nativeZipSha256': args.core_sha256,
        'mainnetEnabled': chain['mainnet_ready'], 'gpuEngine': 'Scrypt 1024/1/1 in browser WebGPU; no CPU search fallback',
        'filesSha256': {name: digest(content) for name, content in sorted(files.items()) if name != 'miner-settings.json'}
    }
    files['bundle-manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    require(len(files) <= 2000, 'The portable runtime inventory exceeds its startup validator.')
    output = args.output.resolve()
    require(not output.exists(), 'Output already exists. Use a new output folder; published assets are immutable.')
    output.mkdir(parents=True, exist_ok=False)
    filename = 'Doodleverse-Windows-GPU-Miner-' + label + '.zip'
    target = output / filename
    with target.open('xb') as stream:
        with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for name, content in sorted(files.items()):
                entry = zipfile.ZipInfo('Doodleverse-Windows/' + name, date_time=(2026, 11, 17, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o100644 << 16
                archive.writestr(entry, content)
    with zipfile.ZipFile(target) as archive:
        require(archive.testzip() is None and len(archive.infolist()) == len(files), 'Portable package integrity failed.')
        for name, content in files.items():
            require(digest(archive.read('Doodleverse-Windows/' + name)) == digest(content), 'Portable package verification failed.')
    output_digest = digest(target.read_bytes())
    (output / 'SHA256SUMS').write_text(output_digest + '  ' + filename + '\n', encoding='utf8')
    (output / 'bundle-manifest.json').write_bytes(files['bundle-manifest.json'])
    print(json.dumps({'file': str(target), 'bytes': target.stat().st_size, 'sha256': output_digest, 'files': len(files),
                      'release': label, 'sourceCommit': head, 'mainnetEnabled': chain['mainnet_ready']}, indent=2))


if __name__ == '__main__':
    main()
