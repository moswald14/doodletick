import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoreOptions } from '../core-options.mjs';

test('pre-existing app options activate an isolated node without forwarding provider credentials', () => {
  assert.deepEqual(parseCoreOptions({ hostname: 'keeper', mozcorp_openai_api_key: 'disposable-fixture' }), { enabled: true, network: 'main', peers: [], listen: true });
});
test('node options reject injected shapes and excessive peers', () => {
  for (const value of [null, [], { dvc_node_enabled: 'yes' }, { dvc_listen: 'yes' }, { dvc_network: '../main' }, { dvc_peers: {} }, { dvc_peers: Array(9).fill('127.0.0.1:38474') }, { dvc_peers: [1] }]) assert.throws(() => parseCoreOptions(value), /options/);
  assert.equal(parseCoreOptions({ dvc_node_enabled: false }).enabled, false);
});
