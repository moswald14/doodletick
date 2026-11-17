// Adapted original ShelfDEFENSE regressions against Keeper's shipped assets.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const __dirname=fileURLToPath(new URL('.',import.meta.url));
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'shelfdefense-game.js'), 'utf8');

function boot(storage = new Map()) {
  const window = {addEventListener() {}, removeEventListener() {}};
  const context = vm.createContext({
    window, console,
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    performance: {now: () => 0}
  });
  vm.runInContext(source, context, {filename: 'shelfdefense-game.js'});
  const canvas = {
    getContext: () => ({}), addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({left: 0, top: 0, width: 1200, height: 700})
  };
  return {game: new window.ShelfDefense(canvas), storage};
}

function selected(game) {
  const tower = game.getSnapshot().selectedTower;
  assert.ok(tower, 'a defender is selected');
  return tower;
}

function node(game, id) {
  const web = selected(game).skillWeb;
  assert.ok(web && Array.isArray(web.nodes), 'the selected defender exposes its mini skill web');
  const found = web.nodes.find(item => item.id === id);
  assert.ok(found, `skill node ${id} is present`);
  return found;
}

function prepareTower(type = 'pencil') {
  const result = boot();
  result.game.coins = 10_000;
  assert.equal(result.game.build(type, 0), true);
  return result;
}

const utilityEffects = {
  pencil: {focus: 'damage', reach: 'range'},
  glue: {focus: 'slowTime', reach: 'splash'},
  band: {focus: 'splash', reach: 'range'},
  knight: {focus: 'range', reach: 'rate'},
  lamp: {focus: 'damage', reach: 'range'}
};

function assertUtilityImproves(type, id, before, after) {
  const stat = utilityEffects[type][id];
  assert.ok(stat === 'rate' ? after[stat] < before[stat] : after[stat] > before[stat],
    `${type} ${id} improves its advertised ${stat} combat effect`);
}

test('the mini web exposes connected nodes and denies purchases before their prerequisites', () => {
  const {game} = prepareTower();
  assert.equal(typeof game.buySkill, 'function');
  const web = selected(game).skillWeb;
  assert.equal(web.nodes.length, 7);
  assert.ok(Array.isArray(web.edges) && web.edges.length >= 6, 'the web exposes connections for the interface');
  assert.equal(node(game, 'core').status, 'owned');
  assert.equal(node(game, 'a').status, 'available');
  assert.equal(node(game, 'b').status, 'available');
  for (const id of ['focus', 'reach', 'mastery', 'legend']) {
    assert.equal(node(game, id).status, 'locked');
    const coins = game.coins, spent = selected(game).spent;
    assert.equal(game.buySkill(id), false, `${id} cannot skip its prerequisite`);
    assert.equal(game.coins, coins);
    assert.equal(selected(game).spent, spent);
    assert.equal(selected(game).level, 1);
  }
  assert.equal(game.buySkill('missing-skill'), false);
  game.destroy();
});

for (const type of ['pencil', 'glue', 'band', 'knight', 'lamp']) {
  test(`${type}: focus and reach independently change combat stats and can only be bought once`, () => {
    const {game} = prepareTower(type);
    assert.equal(game.buySkill('a'), true);
    assert.equal(node(game, 'a').status, 'owned');
    assert.equal(node(game, 'b').status, 'blocked');
    assert.equal(node(game, 'focus').status, 'available');
    assert.equal(node(game, 'reach').status, 'available');
    const coinsBeforeLock = game.coins;
    assert.equal(game.buySkill('b'), false, 'the other specialization remains locked');
    assert.equal(game.coins, coinsBeforeLock);

    let before = selected(game), balance = game.coins;
    let combatBefore = game.stats(game.towers[0]);
    const focusPrice = node(game, 'focus').cost;
    assert.ok(focusPrice > 0);
    assert.equal(game.buySkill('focus'), true);
    let after = selected(game);
    assert.equal(game.coins, balance - focusPrice);
    assert.equal(after.spent, before.spent + focusPrice);
    assertUtilityImproves(type, 'focus', combatBefore, game.stats(game.towers[0]));
    assert.equal(after.level, before.level, 'a utility does not consume a mastery level');
    assert.equal(node(game, 'focus').status, 'owned');
    assert.equal(node(game, 'reach').status, 'available', 'buying focus does not exclude reach');

    const balanceAfterFocus = game.coins;
    assert.equal(game.buySkill('focus'), false);
    assert.equal(game.coins, balanceAfterFocus, 'duplicate focus purchases do not charge coins');

    before = selected(game); balance = game.coins;
    combatBefore = game.stats(game.towers[0]);
    const reachPrice = node(game, 'reach').cost;
    assert.ok(reachPrice > 0);
    assert.equal(game.buySkill('reach'), true);
    after = selected(game);
    assert.equal(game.coins, balance - reachPrice);
    assert.equal(after.spent, before.spent + reachPrice);
    assertUtilityImproves(type, 'reach', combatBefore, game.stats(game.towers[0]));
    assert.equal(after.level, before.level);
    assert.equal(node(game, 'focus').status, 'owned');
    assert.equal(node(game, 'reach').status, 'owned');
    const paidBalance = game.coins;
    assert.equal(game.buySkill('reach'), false);
    assert.equal(game.coins, paidBalance, 'duplicate reach purchases do not charge coins');
    game.destroy();
  });
}

test('mastery and legend follow the chosen branch, stop at level four and include skills in the sale refund', () => {
  const {game} = prepareTower();
  assert.equal(game.buySkill('b'), true);
  assert.equal(selected(game).level, 2);
  assert.equal(game.buySkill('legend'), false, 'legend requires mastery first');
  assert.equal(game.buySkill('focus'), true);
  assert.equal(game.buySkill('reach'), true);
  assert.equal(game.buySkill('mastery'), true);
  assert.equal(selected(game).level, 3);
  assert.equal(game.buySkill('legend'), true);
  const tower = selected(game);
  assert.equal(tower.level, 4);
  assert.equal(node(game, 'mastery').status, 'owned');
  assert.equal(node(game, 'legend').status, 'owned');
  const balance = game.coins;
  assert.equal(game.buySkill('legend'), false);
  assert.equal(game.buySkill('mastery'), false);
  assert.equal(game.coins, balance);
  assert.equal(tower.spent, 10_000 - balance, 'branch and utility prices all count toward investment');
  assert.ok(tower.sellValue > game.defs.pencil.cost, 'the refund includes upgrades and utility skills');
  assert.equal(game.sell(), true);
  assert.equal(game.coins, balance + tower.sellValue);
  game.destroy();
});

test('an unaffordable skill leaves the web and invested coins unchanged', () => {
  const {game} = prepareTower();
  game.buySkill('a');
  const before = selected(game), cost = node(game, 'focus').cost;
  game.coins = cost - 1;
  const coins = game.coins;
  assert.equal(game.buySkill('focus'), false);
  assert.equal(game.coins, coins);
  assert.equal(selected(game).spent, before.spent);
  assert.equal(node(game, 'focus').status, 'available');
  game.destroy();
});

test('utility ownership and combat improvements survive a save and reload', () => {
  const first = prepareTower('band');
  first.game.buySkill('b');
  first.game.buySkill('focus');
  first.game.buySkill('reach');
  const before = selected(first.game);
  const coins = first.game.coins;
  first.game.saveProgress();
  const second = boot(first.storage);
  assert.equal(second.game.towers.length, 1);
  const tower = second.game.towers[0];
  second.game.pointer(tower.x, tower.y);
  const after = selected(second.game);
  assert.equal(second.game.coins, coins);
  assert.equal(after.damage, before.damage);
  assert.equal(after.dps, before.dps);
  assert.equal(after.range, before.range);
  assert.equal(after.spent, before.spent);
  assert.equal(node(second.game, 'focus').status, 'owned');
  assert.equal(node(second.game, 'reach').status, 'owned');
  const balance = second.game.coins;
  assert.equal(second.game.buySkill('focus'), false);
  assert.equal(second.game.coins, balance);
  second.game.destroy();
});

test('old upgraded defender saves without a skills field still restore and can buy utility nodes', () => {
  const first = prepareTower();
  first.game.upgrade('a');
  const before = selected(first.game);
  delete first.game.towers[0].skills;
  first.game.saveProgress();
  const second = boot(first.storage);
  assert.equal(second.game.towers.length, 1, 'a pre-web save is not discarded');
  const tower = second.game.towers[0];
  second.game.pointer(tower.x, tower.y);
  const after = selected(second.game);
  assert.equal(after.level, before.level);
  assert.equal(after.branch, before.branch);
  assert.equal(after.spent, before.spent);
  assert.equal(node(second.game, 'a').status, 'owned');
  assert.equal(node(second.game, 'focus').status, 'available');
  assert.equal(second.game.buySkill('focus'), true);
  second.game.destroy();
});

function battle() {
  const {game} = boot();
  assert.equal(game.startWave(), true);
  game.queue = [];
  game.spawnTimer = 100;
  return game;
}

function placeOnPath(game, enemy, distance) {
  enemy.distance = distance;
  const point = game.atDistance(distance);
  enemy.x = point.x; enemy.y = point.y;
  return enemy;
}

test('the new enemy families occur naturally in the campaign wave schedule', () => {
  const {game} = boot();
  const scheduled = new Set();
  for (let wave = 1; wave <= game.maxWaves; wave++) {
    game.wave = wave - 1;
    game.phase = 'build';
    assert.equal(game.startWave(), true);
    for (const item of game.queue) scheduled.add(item.type);
  }
  for (const type of ['moth', 'inkling', 'binder', 'nurse']) {
    assert.ok(scheduled.has(type), `${type} reaches players through the normal campaign`);
  }
  game.destroy();
});

test('Pocket Knight cannot target a flying moth or hit it with splash from a ground target', () => {
  const {game} = boot();
  assert.equal(game.build('knight', 0), true);
  assert.equal(game.startWave(), true);
  game.queue = [];
  game.spawnTimer = 100;
  const moth = placeOnPath(game, game.spawnEnemy('moth'), 130);
  moth.speed = 0.1;
  const initialHp = moth.hp;
  for (let i = 0; i < 20; i++) game.update(0.025);
  assert.equal(moth.hp, initialHp, 'an unsupported flying target takes no melee damage');
  assert.equal(game.beams.filter(beam => beam.melee).length, 0, 'the knight does not swing at a moth');

  const ground = placeOnPath(game, game.spawnEnemy('dust'), moth.distance + 5);
  ground.speed = 0.1;
  const groundHp = ground.hp;
  for (let i = 0; i < 20; i++) game.update(0.025);
  assert.ok(ground.hp < groundHp || ground.dead, 'the knight still attacks a ground target beside it');
  assert.equal(moth.hp, initialHp, 'nearby flying enemies are excluded from the melee splash');
  game.destroy();
});

test('a defeated Inkling splits into exactly two crumbs at its death location once', () => {
  const game = battle();
  const inkling = placeOnPath(game, game.spawnEnemy('inkling'), 600);
  const position = inkling.distance;
  game.damage(inkling, inkling.maxHp * 10, null, {ignoreArmor: true});
  let crumbs = game.enemies.filter(enemy => enemy.type === 'crumb' && !enemy.dead);
  assert.equal(crumbs.length, 2);
  assert.notEqual(crumbs[0].id, crumbs[1].id);
  for (const crumb of crumbs) {
    assert.ok(Math.abs(crumb.distance - position) <= 30, 'split children continue from the death location');
    const expected = game.atDistance(crumb.distance);
    assert.ok(Math.hypot(crumb.x - expected.x, crumb.y - expected.y) < 1);
  }
  const ids = crumbs.map(enemy => enemy.id).sort();
  const coins = game.coins, kills = game.kills;
  game.damage(inkling, inkling.maxHp * 10, null, {ignoreArmor: true});
  crumbs = game.enemies.filter(enemy => enemy.type === 'crumb' && !enemy.dead);
  assert.deepEqual(crumbs.map(enemy => enemy.id).sort(), ids, 'hitting a dead parent cannot spawn another pair');
  assert.equal(game.coins, coins);
  assert.equal(game.kills, kills);
  game.destroy();
});

test('a Binder shield absorbs hits before its health and passes excess damage through once', () => {
  const game = battle();
  const binder = game.spawnEnemy('binder');
  const hp = binder.hp, shield = binder.shieldHp;
  assert.ok(shield > 0, 'a Binder spawns with a live shield');
  game.damage(binder, shield / 2, null, {ignoreArmor: true});
  assert.equal(binder.hp, hp);
  assert.equal(binder.shieldHp, shield / 2);
  const excess = 1;
  game.damage(binder, binder.shieldHp + excess, null, {ignoreArmor: true});
  assert.equal(binder.shieldHp, 0);
  assert.equal(binder.hp, hp - excess);
  game.damage(binder, excess, null, {ignoreArmor: true});
  assert.equal(binder.hp, hp - excess * 2, 'a depleted shield cannot absorb another hit');
  game.destroy();
});

test('Mender Mite heals nearby allies up to their maximum without healing itself or remote enemies', () => {
  const game = battle();
  const nurse = placeOnPath(game, game.spawnEnemy('nurse'), 400);
  assert.equal(nurse.name, 'Mender Mite');
  const hurt = placeOnPath(game, game.spawnEnemy('bookworm'), 410);
  const nearlyFull = placeOnPath(game, game.spawnEnemy('dust'), 420);
  const remote = placeOnPath(game, game.spawnEnemy('dust'), game.pathLength - 200);
  for (const enemy of [nurse, hurt, nearlyFull, remote]) enemy.speed = 0.1;
  nurse.hp *= 0.5;
  hurt.hp *= 0.5;
  nearlyFull.hp -= 0.1;
  remote.hp *= 0.5;
  const nurseHp = nurse.hp, hurtHp = hurt.hp, remoteHp = remote.hp;
  for (let i = 0; i < 120; i++) game.update(0.05);
  assert.ok(hurt.hp > hurtHp, 'a nearby wounded ally actually recovers health');
  assert.ok(hurt.hp <= hurt.maxHp);
  assert.equal(nearlyFull.hp, nearlyFull.maxHp, 'healing is capped at the ally maximum');
  assert.equal(nurse.hp, nurseHp, 'the healer does not heal itself');
  assert.equal(remote.hp, remoteHp, 'healing does not reach distant enemies');
  game.destroy();
});
