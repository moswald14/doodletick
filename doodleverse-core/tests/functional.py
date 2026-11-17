#!/usr/bin/env python3
"""Disposable real-node integration checks. Never uses an operator wallet or chain."""
import argparse
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import tempfile
import time

GENESIS = 'e410039c6dc7111cf8b680962a2fc7fdafec5878f96dce4e79043d754417a44e'
FOUNDER_SCRIPT = '76a914751e76e8199196d454941c45d1b3a323f1433bd688ac'
COIN = 100000000


def wait_for(check, timeout=40):
    until = time.monotonic() + timeout
    last = None
    while time.monotonic() < until:
        try:
            result = check()
            if result:
                return result
        except (OSError, RuntimeError) as error:
            last = error
        time.sleep(0.15)
    raise AssertionError('Timed out waiting for node: ' + str(last))


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def dh(data):
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def varint(number):
    if number < 253:
        return bytes([number])
    if number <= 65535:
        return b'\xfd' + struct.pack('<H', number)
    return b'\xfe' + struct.pack('<I', number)


def script_number(number):
    if 0 <= number <= 16:
        return bytes([0 if number == 0 else 0x50 + number])
    result = bytearray()
    while number:
        result.append(number & 255)
        number >>= 8
    if result and result[-1] & 128:
        result.append(0)
    return bytes([len(result)]) + result


def block_from_template(template, payout_script, *, extra=0, wrong_founder=False):
    """Independent Scrypt + wire-format implementation, no fake consensus results."""
    script_sig = script_number(template['height']) + b'\x0aDVC-test-1'
    outputs = [(template['dvcminerreward'] + extra, bytes.fromhex(payout_script))]
    if 'dvcfoundation' in template:
        founder = template['dvcfoundation']
        outputs.append((founder['value'], bytes.fromhex(payout_script if wrong_founder else founder['scriptPubKey'])))
    tx = struct.pack('<I', 1) + b'\x01' + bytes(32) + b'\xff' * 4
    tx += varint(len(script_sig)) + script_sig + b'\xff' * 4 + varint(len(outputs))
    for value, script in outputs:
        tx += struct.pack('<Q', value) + varint(len(script)) + script
    tx += bytes(4)
    transactions = [bytes.fromhex(item['data']) for item in template['transactions']]
    hashes = [dh(tx)] + [bytes.fromhex(item['txid'])[::-1] for item in template['transactions']]
    while len(hashes) > 1:
        if len(hashes) % 2:
            hashes.append(hashes[-1])
        hashes = [dh(hashes[i] + hashes[i + 1]) for i in range(0, len(hashes), 2)]
    header = struct.pack('<I', template['version']) + bytes.fromhex(template['previousblockhash'])[::-1] + hashes[0]
    header += struct.pack('<II', template['curtime'], int(template['bits'], 16))
    target = int(template['target'], 16)
    for nonce in range(100000):
        candidate = header + struct.pack('<I', nonce)
        pow_hash = hashlib.scrypt(candidate, salt=candidate, n=1024, r=1, p=1, dklen=32)
        if int.from_bytes(pow_hash, 'little') <= target:
            return (candidate + varint(1 + len(transactions)) + tx + b''.join(transactions)).hex(), dh(candidate)[::-1].hex()
    raise AssertionError('Regtest Scrypt solve exceeded bounded attempts')


class Node:
    def __init__(self, daemon, directory):
        self.daemon, self.directory = daemon, directory
        directory.mkdir()
        self.rpc_port, self.p2p_port = free_port(), free_port()
        while self.p2p_port == self.rpc_port:
            self.p2p_port = free_port()
        self.process = None

    def start(self):
        self.log = open(self.directory / 'test-output.txt', 'ab')
        command = [self.daemon, '-regtest', '-server=1', '-listen=1', '-dnsseed=0', '-discover=0', '-upnp=0',
                   '-bind=127.0.0.1', '-rpcbind=127.0.0.1', '-rpcallowip=127.0.0.1', '-txindex=1',
                   '-datadir=' + str(self.directory), '-port=' + str(self.p2p_port), '-rpcport=' + str(self.rpc_port)]
        self.process = subprocess.Popen(command, stdout=self.log, stderr=self.log)
        try:
            wait_for(lambda: self.rpc('getblockchaininfo'))
        except Exception:
            self.log.flush()
            raise AssertionError((self.directory / 'test-output.txt').read_text(errors='replace')[-8000:])

    def rpc(self, method, *params):
        if self.process.poll() is not None:
            raise RuntimeError('Node exited early')
        cookie = (self.directory / 'regtest' / '.cookie').read_bytes().strip()
        connection = http.client.HTTPConnection('127.0.0.1', self.rpc_port, timeout=10)
        try:
            connection.request('POST', '/', json.dumps({'jsonrpc': '1.0', 'id': 1, 'method': method, 'params': params}),
                               {'Content-Type': 'application/json', 'Authorization': 'Basic ' + base64.b64encode(cookie).decode()})
            result = json.loads(connection.getresponse().read())
        finally:
            connection.close()
        if result.get('error'):
            raise RuntimeError(json.dumps(result['error']))
        return result['result']

    def stop(self):
        if self.process is None:
            return
        if self.process.poll() is None:
            try:
                self.rpc('stop')
                self.process.wait(timeout=20)
            except Exception:
                self.process.terminate()
                self.process.wait(timeout=10)
        self.log.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--daemon', required=True)
    parser.add_argument('--cli', required=True)
    args = parser.parse_args()
    daemon, cli = str(Path(args.daemon).resolve()), str(Path(args.cli).resolve())
    assert Path(daemon).is_file() and Path(cli).is_file()
    with tempfile.TemporaryDirectory(prefix='dvc-regtest-') as temporary:
        root = Path(temporary)
        first, second = Node(daemon, root / 'one'), Node(daemon, root / 'two')
        try:
            # Production startup must fail before opening a spendable unpinned chain.
            main_dir = root / 'main-guard'
            main_dir.mkdir()
            guard = subprocess.run([daemon, '-datadir=' + str(main_dir), '-listen=0', '-dnsseed=0', '-printtoconsole=1'],
                                   capture_output=True, timeout=20)
            assert guard.returncode != 0, 'Mainnet started without an approved founder script'
            assert 'founder' in (guard.stdout + guard.stderr).decode(errors='replace').lower()
            first.start()
            second.start()
            assert first.rpc('getblockhash', 0) == second.rpc('getblockhash', 0) == GENESIS
            assert first.rpc('getblockchaininfo')['chain'] == 'regtest'
            assert 'DoodleverseCore' in first.rpc('getnetworkinfo')['subversion']
            first.rpc('addnode', '127.0.0.1:' + str(second.p2p_port), 'onetry')
            wait_for(lambda: first.rpc('getconnectioncount') >= 1)
            address = first.rpc('getnewaddress', 'test-miner')
            receiver = second.rpc('getnewaddress', 'test-receiver')
            script = first.rpc('validateaddress', address)['scriptPubKey']
            template = first.rpc('getblocktemplate', {'rules': ['segwit']})
            assert template['height'] == 1 and template['dvcminerreward'] == 50 * COIN
            assert template['dvcfoundation'] == {'required': True, 'value': 1000000 * COIN, 'scriptPubKey': FOUNDER_SCRIPT}
            assert template['coinbasevalue'] == 1000050 * COIN
            for options in [{'extra': 1}, {'wrong_founder': True}]:
                invalid, _ = block_from_template(template, script, **options)
                assert first.rpc('submitblock', invalid) is not None, 'Invalid coinbase accepted'
                assert first.rpc('getblockcount') == 0
            block, block_hash = block_from_template(template, script)
            assert first.rpc('submitblock', block) is None
            wait_for(lambda: second.rpc('getbestblockhash') == block_hash)
            block_details = first.rpc('getblock', block_hash)
            coinbase = first.rpc('getrawtransaction', block_details['tx'][0], True)
            assert sorted(round(out['value'] * COIN) for out in coinbase['vout']) == [50 * COIN, 1000000 * COIN]
            assert any(out['scriptPubKey']['hex'] == FOUNDER_SCRIPT for out in coinbase['vout'])
            # The standard Core CLI also works; cookie auth stays in the disposable directory.
            result = subprocess.run([cli, '-regtest', '-datadir=' + str(first.directory), '-rpcport=' + str(first.rpc_port), 'getblockcount'], capture_output=True, text=True, check=True)
            assert int(result.stdout) == 1
            assert first.rpc('getbalance') == 0, 'Immature coinbase is spendable'
            bridge_check = Path(__file__).with_name('bridge-functional.mjs')
            subprocess.run(['node', str(bridge_check), str(first.rpc_port), str(first.directory / 'regtest' / '.cookie'), address], check=True)
            first.rpc('generatetoaddress', 31, address)
            wait_for(lambda: second.rpc('getblockcount') == first.rpc('getblockcount'))
            assert first.rpc('getbalance') >= 50
            first.rpc('settxfee', 0.01)
            payment = first.rpc('sendtoaddress', receiver, 7)
            first.rpc('generatetoaddress', 1, address)
            wait_for(lambda: second.rpc('gettransaction', payment)['confirmations'] >= 1)
            assert second.rpc('getbalance') == 7
            # Isolated histories converge to the branch with more verified work.
            first.rpc('disconnectnode', '127.0.0.1:' + str(second.p2p_port))
            wait_for(lambda: first.rpc('getconnectioncount') == 0)
            first.rpc('generatetoaddress', 1, address)
            second.rpc('generatetoaddress', 3, receiver)
            winning = second.rpc('getbestblockhash')
            first.rpc('addnode', '127.0.0.1:' + str(second.p2p_port), 'onetry')
            wait_for(lambda: first.rpc('getbestblockhash') == winning)
            balance = first.rpc('getbalance')
            first.stop()
            first.start()
            assert first.rpc('getbestblockhash') == winning and first.rpc('getbalance') == balance
            assert first.rpc('gettransaction', payment)['confirmations'] >= 1
            print(json.dumps({'passed': True, 'network': 'disposable regtest', 'height': first.rpc('getblockcount'),
                              'checks': ['mainnet guard', 'isolated genesis', 'two peers', 'Scrypt proof', 'founder output',
                                         'overpayment rejection', 'founder redirection rejection', 'maturity', 'CLI',
                                         'Keeper mining bridge', 'transfer', 'reorganization', 'restart persistence']}))
        finally:
            first.stop()
            second.stop()


if __name__ == '__main__':
    main()
