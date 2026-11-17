#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Exercise encrypted wallet backup/recovery using disposable DVC regtest nodes.

Usage: python wallet-recovery.py --daemon PATH --cli PATH

This test never opens operator data, accepts a wallet/data-directory argument,
imports owner keys, or dumps private keys. All wallets, RPC cookies, backups and
logs live in one newly created temporary tree, removed after stopping its nodes.
The randomly generated test passphrase stays in memory and loopback RPC bodies;
it is never printed, written to a file, or passed on a process command line.
Only public receiving addresses, a public transaction ID and balances are output.

The encrypted backup predates funding. A fresh wallet-disabled node downloads
the test chain, then loads that backup with -rescan. Recovering the later reward
therefore requires discovering history absent from the backup. A fresh main
identity probe has no wallet or peers and stays at height zero; all funding,
mining and payments use regtest. The test has a 240-second budget, with separately
bounded shutdown/cleanup. Windows child processes do not open console windows.
"""

import argparse
import base64
from decimal import Decimal
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import time

from functional import COIN, GENESIS, free_port, probe_mainnet, wait_for


# This already-disclosed fixture receives padding rewards only. Neither test
# wallet imports its public test key or claims the founder allocation.
PADDING_ADDRESS = 'nFXpqKGstGktjrogxmR28tu6ccJCfGSTEk'
INITIAL_ATOMS = 50 * COIN
PAYMENT_ATOMS = 7 * COIN
TEST_TIMEOUT = 240


def hidden_process_options():
    return {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}


def atoms(value):
    exact = Decimal(str(value)) * COIN
    if not exact.is_finite() or exact != exact.to_integral_value():
        raise AssertionError('RPC amount is not an exact atomic-unit amount')
    return int(exact)


class Budget:
    def __init__(self):
        self.deadline = time.monotonic() + TEST_TIMEOUT

    def left(self, maximum):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise AssertionError('Wallet recovery test exceeded its 240-second budget')
        return min(maximum, remaining)

    def wait(self, check, maximum=40):
        return wait_for(check, timeout=self.left(maximum))


class RpcError(RuntimeError):
    def __init__(self, method, code):
        # Do not include request arguments or RPC-returned text in failures.
        super().__init__('Test RPC ' + method + ' failed with code ' + str(code))
        self.code = code


class RecoveryNode:
    def __init__(self, daemon, root, name, budget, used_ports):
        self.daemon, self.root, self.budget = daemon, root, budget
        self.directory = root / name
        assert self.directory.parent == root and not self.directory.exists()
        self.directory.mkdir()
        self.backups = self.directory / 'backups'
        self.backups.mkdir()
        self.rpc_port, self.p2p_port = [self.choose_port(used_ports) for _ in range(2)]
        self.process = None
        self.log = None

    @staticmethod
    def choose_port(used):
        for _ in range(100):
            candidate = free_port()
            if candidate not in used:
                used.add(candidate)
                return candidate
        raise AssertionError('Could not allocate separate test ports')

    def start(self, *, wallet=True, rescan=False):
        assert self.process is None and self.directory.resolve().is_relative_to(self.root)
        self.log = open(self.directory / 'test-output.txt', 'ab')
        command = [self.daemon, '-regtest', '-server=1', '-listen=1', '-connect=0',
                   '-dnsseed=0', '-discover=0', '-upnp=0', '-listenonion=0',
                   '-bind=127.0.0.1', '-rpcbind=127.0.0.1', '-rpcallowip=127.0.0.1',
                   '-keypool=8', '-wallet=wallet.dat', '-printtoconsole=1', '-debug=0',
                   '-datadir=' + str(self.directory), '-backupdir=' + str(self.backups),
                   '-port=' + str(self.p2p_port), '-rpcport=' + str(self.rpc_port)]
        if not wallet:
            command.append('-disablewallet=1')
        if rescan:
            command.append('-rescan=1')
        self.process = subprocess.Popen(command, cwd=self.directory, stdin=subprocess.DEVNULL,
                                        stdout=self.log, stderr=self.log, **hidden_process_options())
        self.budget.wait(lambda: self.rpc('getblockchaininfo'))
        assert self.rpc('getblockchaininfo')['chain'] == 'regtest'
        assert self.rpc('getblockhash', 0) == GENESIS, 'Wrong genesis: refusing wallet operations'
        assert self.rpc('getnetworkinfo')['subversion'].startswith('/DoodleverseCore:')

    def rpc(self, method, *params, cleanup=False):
        if self.process is None or self.process.poll() is not None:
            code = None if self.process is None else self.process.returncode
            raise AssertionError('Disposable node exited before ' + method + ': ' + str(code))
        cookie = (self.directory / 'regtest' / '.cookie').read_bytes().strip()
        assert 0 < len(cookie) <= 512
        connection = http.client.HTTPConnection('127.0.0.1', self.rpc_port,
                                                timeout=5 if cleanup else self.budget.left(10))
        try:
            connection.request('POST', '/', json.dumps({'jsonrpc': '1.0', 'id': 1,
                                                       'method': method, 'params': params}),
                               {'Content-Type': 'application/json',
                                'Authorization': 'Basic ' + base64.b64encode(cookie).decode()})
            response = connection.getresponse()
            payload = response.read(1024 * 1024 + 1)
            if len(payload) > 1024 * 1024:
                raise AssertionError('Test RPC response exceeded the bounded size')
            result = json.loads(payload, parse_float=Decimal)
        finally:
            connection.close()
        if result.get('error'):
            raise RpcError(method, result['error']['code'])
        assert result.get('id') == 1 and 'result' in result
        return result['result']

    def expect_error(self, code, method, *params):
        try:
            self.rpc(method, *params)
        except RpcError as error:
            assert error.code == code, 'Unexpected RPC rejection code'
        else:
            raise AssertionError('Expected rejection from ' + method)

    def wait_for_encryption_shutdown(self):
        assert self.process is not None
        result = self.process.wait(timeout=self.budget.left(30))
        assert result == 0, 'Encryption did not shut down the test node cleanly'
        self.log.close()
        self.log = None
        self.process = None

    def stop(self):
        try:
            if self.process is not None and self.process.poll() is None:
                try:
                    self.rpc('stop', cleanup=True)
                    self.process.wait(timeout=20)
                except (OSError, RuntimeError, AssertionError, ValueError, subprocess.TimeoutExpired,
                        http.client.HTTPException):
                    if self.process.poll() is None:
                        self.process.terminate()
                        try:
                            self.process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            self.process.kill()
                            self.process.wait(timeout=10)
        finally:
            if self.log is not None:
                self.log.close()
                self.log = None
        if self.process is not None:
            assert self.process.poll() is not None, 'Test node did not stop'
        self.process = None


def check_balance(node, expected, *, locked=None):
    info = node.rpc('getwalletinfo')
    assert atoms(info['balance']) == expected, 'Unexpected exact wallet balance'
    assert atoms(info['unconfirmed_balance']) == 0, 'Unexpected unconfirmed balance'
    assert atoms(info['immature_balance']) == 0, 'Unexpected immature balance'
    if locked is not None:
        assert 'unlocked_until' in info, 'Restored wallet is not encrypted'
        if locked:
            assert info['unlocked_until'] == 0, 'Encrypted wallet is unexpectedly unlocked'
        else:
            assert info['unlocked_until'] > 0, 'Test unlock did not take effect'
    return info


def connect_and_sync(node, peer, budget):
    node.rpc('addnode', '127.0.0.1:' + str(peer.p2p_port), 'onetry')
    budget.wait(lambda: node.rpc('getconnectioncount') >= 1)
    tip = peer.rpc('getbestblockhash')
    budget.wait(lambda: node.rpc('getbestblockhash') == tip)


def exercise(daemon, cli, root, nodes, budget):
    used_ports = set()
    source, peer, restored = [RecoveryNode(daemon, root, name, budget, used_ports)
                              for name in ('original', 'peer', 'restored')]
    nodes.extend((source, peer, restored))
    source.start()
    peer.start()
    assert source.rpc('getblockcount') == peer.rpc('getblockcount') == 0
    check_balance(source, 0)
    check_balance(peer, 0)

    # No owner input is accepted. This random disposable phrase is never output.
    passphrase = secrets.token_urlsafe(32)
    source.rpc('encryptwallet', passphrase)
    source.wait_for_encryption_shutdown()
    source.start()
    check_balance(source, 0, locked=True)
    source.rpc('walletpassphrase', passphrase, 120)
    receiving = source.rpc('getnewaddress', 'disposable-recovery-receiving')
    source.rpc('walletlock')
    assert check_balance(source, 0, locked=True)['txcount'] == 0
    recipient = peer.rpc('getnewaddress', 'disposable-recovery-recipient')
    assert not source.rpc('validateaddress', PADDING_ADDRESS)['ismine']
    assert not peer.rpc('validateaddress', PADDING_ADDRESS)['ismine']

    # Upstream backupwallet uses -backupdir plus the supplied filename; it does
    # not honor an arbitrary parent directory in the RPC argument.
    backup = source.backups / 'encrypted-recovery-backup.dat'
    assert not backup.exists()
    source.rpc('backupwallet', backup.name)
    assert backup.is_file() and backup.stat().st_size > 0
    assert backup.resolve().is_relative_to(root)

    funding_block = source.rpc('generatetoaddress', 1, receiving, 100000)[0]
    funding_txid = source.rpc('getblock', funding_block)['tx'][0]
    assert len(source.rpc('generatetoaddress', 30, PADDING_ADDRESS, 100000)) == 30
    check_balance(source, INITIAL_ATOMS, locked=True)
    source.expect_error(-13, 'sendtoaddress', recipient, 7)
    assert source.rpc('getrawmempool') == []
    check_balance(source, INITIAL_ATOMS, locked=True)
    # Have the independent peer download and retain the chain before stopping
    # the original wallet. No original chain or wallet files are copied to it.
    peer.rpc('addnode', '127.0.0.1:' + str(source.p2p_port), 'onetry')
    target = source.rpc('getbestblockhash')
    budget.wait(lambda: peer.rpc('getbestblockhash') == target)
    assert peer.rpc('getblockcount') == 31
    check_balance(peer, 0)
    source.stop()

    # Sync first with no wallet, then install only the encrypted pre-funding
    # backup. -rescan must recover the missing funding transaction from blocks.
    restored.start(wallet=False)
    connect_and_sync(restored, peer, budget)
    restored.stop()
    destination = restored.directory / 'regtest' / 'wallet.dat'
    assert destination.parent.resolve().is_relative_to(root) and not destination.exists()
    shutil.copyfile(backup, destination)
    restored.start(rescan=True)
    assert restored.rpc('validateaddress', receiving)['ismine']
    check_balance(restored, INITIAL_ATOMS, locked=True)
    funding = restored.rpc('gettransaction', funding_txid)
    assert funding['generated'] is True and funding['confirmations'] == 31
    assert atoms(funding['amount']) == INITIAL_ATOMS
    restored.expect_error(-14, 'walletpassphrase', secrets.token_urlsafe(32), 30)
    restored.expect_error(-13, 'sendtoaddress', recipient, 7)
    check_balance(restored, INITIAL_ATOMS, locked=True)
    connect_and_sync(restored, peer, budget)

    restored.rpc('settxfee', '0.01')
    restored.rpc('walletpassphrase', passphrase, 120)
    check_balance(restored, INITIAL_ATOMS, locked=False)
    payment = restored.rpc('sendtoaddress', recipient, 7)
    assert re.fullmatch('[0-9a-f]{64}', payment)
    details = restored.rpc('gettransaction', payment)
    decoded = restored.rpc('decoderawtransaction', details['hex'])
    # Verify fees independently from this wallet's single known 50-DVC input.
    assert len(decoded['vin']) == 1
    assert decoded['vin'][0]['txid'] == funding_txid and decoded['vin'][0]['vout'] == 0
    wire_fee = INITIAL_ATOMS - sum(atoms(output['value']) for output in decoded['vout'])
    assert 0 < wire_fee <= COIN // 100, 'Unexpected fee for the bounded test payment'
    assert wire_fee == -atoms(details['fee'])
    assert atoms(details['amount']) == -PAYMENT_ATOMS
    assert sum(atoms(output['value']) for output in decoded['vout']
               if recipient in output['scriptPubKey'].get('addresses', [])) == PAYMENT_ATOMS
    restored.rpc('walletlock')
    assert restored.rpc('getwalletinfo')['unlocked_until'] == 0
    budget.wait(lambda: payment in peer.rpc('getrawmempool'))
    confirmed = peer.rpc('generatetoaddress', 1, PADDING_ADDRESS, 100000)[0]
    budget.wait(lambda: restored.rpc('getbestblockhash') == confirmed)
    budget.wait(lambda: restored.rpc('gettransaction', payment)['confirmations'] == 1)
    budget.wait(lambda: peer.rpc('gettransaction', payment)['confirmations'] == 1)
    remaining = INITIAL_ATOMS - PAYMENT_ATOMS - wire_fee
    check_balance(restored, remaining, locked=True)
    check_balance(peer, PAYMENT_ATOMS)

    # The native CLI is read-only here; the test passphrase never enters argv.
    command = [cli, '-regtest', '-datadir=' + str(restored.directory),
               '-rpcport=' + str(restored.rpc_port), 'getbalance']
    cli_result = subprocess.run(command, stdin=subprocess.DEVNULL, capture_output=True, text=True,
                                timeout=budget.left(15), **hidden_process_options())
    assert cli_result.returncode == 0, 'Native CLI failed after encrypted-wallet recovery'
    assert atoms(Decimal(cli_result.stdout.strip())) == remaining
    restored.stop()
    restored.start()
    check_balance(restored, remaining, locked=True)
    assert restored.rpc('gettransaction', payment)['confirmations'] == 1
    return {'passed': True, 'network': 'disposable regtest', 'height': 32,
            'receivingAddress': receiving, 'recipientAddress': recipient, 'paymentTxid': payment,
            'initialBalanceAtoms': INITIAL_ATOMS, 'paymentAtoms': PAYMENT_ATOMS,
            'feeAtoms': wire_fee, 'restoredBalanceAtoms': remaining,
            'recipientBalanceAtoms': PAYMENT_ATOMS,
            'checks': ['encryption and automatic shutdown', 'locked spend rejected',
                       'encrypted backup before funding', 'fresh node sync without wallet',
                       'restore and rescan recovered absent transaction', 'wrong passphrase rejected',
                       'unlock and confirmed test payment', 'exact balances and independent fee check',
                       'native CLI', 'relocked restart persistence']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--daemon', required=True, help='Doodleverse test-node executable')
    parser.add_argument('--cli', required=True, help='Matching native command-line client')
    args = parser.parse_args()
    daemon, cli = str(Path(args.daemon).resolve(strict=True)), str(Path(args.cli).resolve(strict=True))
    assert Path(daemon).is_file() and Path(cli).is_file()
    budget, nodes = Budget(), []
    temporary_parent = Path(tempfile.gettempdir()).resolve()
    with tempfile.TemporaryDirectory(prefix='dvc-wallet-recovery-') as temporary:
        root = Path(temporary).resolve()
        assert root.parent == temporary_parent and root.name.startswith('dvc-wallet-recovery-')
        try:
            probe_mainnet(daemon, root / 'main-identity')
            result = exercise(daemon, cli, root, nodes, budget)
            result['checks'].insert(0, 'main identity without wallet, peers or coins')
        finally:
            errors = []
            for node in reversed(nodes):
                try:
                    node.stop()
                except Exception as error:
                    errors.append(type(error).__name__)
            # Verify the exact generated root before TemporaryDirectory performs
            # recursive cleanup, including on Windows. No user path is accepted.
            assert root.resolve() == root and root.parent == temporary_parent
            assert root.name.startswith('dvc-wallet-recovery-')
            if errors:
                raise RuntimeError('Test-node cleanup failed: ' + ', '.join(errors))
    assert not root.exists(), 'Temporary wallet/backup cleanup failed'
    result['temporaryDataRemoved'] = True
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
