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

const engineSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'shelfdefense-game.js'), 'utf8');

function freshGame() {
  const values = new Map();
  const listeners = new Map();
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
  const window = {
    addEventListener: (event, fn) => listeners.set(event, fn),
    removeEventListener: event => listeners.delete(event)
  };
  const context = vm.createContext({
    window, localStorage: storage, console,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    performance: {now: () => 0}
  });
  vm.runInContext(engineSource, context, {filename: 'shelfdefense-game.js'});
  const canvas = {
    getContext: () => ({}),
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({left: 0, top: 0, width: 1200, height: 700})
  };
  return new window.ShelfDefense(canvas);
}

function selected(game) {
  const tower = game.getSnapshot().selectedTower;
  assert.ok(tower, 'the built defender remains selected');
  return tower;
}

for (const type of ['pencil', 'glue', 'band', 'knight', 'lamp']) {
  for (const branch of ['a', 'b']) {
    test(`${type}: ${branch} upgrade path spends coins, improves combat, locks its branch and refunds once`, () => {
      const game = freshGame();
      // Supply an earned-currency fixture so every public upgrade path can be exercised.
      const budget = 10_000;
      game.coins = budget;
      const price = game.defs[type].cost;
      assert.equal(game.build(type, 0), true);
      assert.equal(game.coins, budget - price);
      assert.equal(game.build(type, 0), false, 'an occupied pad cannot charge a second purchase');
      assert.equal(game.coins, budget - price);

      let before = selected(game);
      const optionName = branch === 'a' ? 'upgradeA' : 'upgradeB';
      const otherOption = branch === 'a' ? 'upgradeB' : 'upgradeA';
      const oppositeBranch = branch === 'a' ? 'b' : 'a';
      const chosenName = before[optionName].name;
      let totalSpent = price;

      while (before.level < 4) {
        const option = before[optionName];
        assert.ok(option && option.cost > 0, 'the next chosen-path upgrade is offered');
        const coinsBefore = game.coins;
        assert.equal(game.upgrade(branch), true);
        const after = selected(game);
        totalSpent += option.cost;
        assert.equal(game.coins, coinsBefore - option.cost, 'the shown price is deducted once');
        assert.equal(after.level, before.level + 1);
        assert.ok(after.damage > before.damage, 'upgrades improve attack power');
        assert.ok(after.dps > before.dps, 'upgrades improve sustained damage');
        assert.ok(after.range >= before.range, 'upgrades do not reduce range');
        assert.equal(after.branchName, chosenName, 'the chosen specialization is retained');
        assert.equal(after[otherOption], null, 'the competing branch is no longer offered');
        assert.equal(game.upgrade(oppositeBranch), false, 'the competing branch cannot be purchased');
        assert.equal(game.coins, coinsBefore - option.cost);
        assert.equal(selected(game).level, after.level);
        before = after;
      }

      assert.equal(before.level, 4);
      assert.equal(before.canUpgrade, false);
      assert.equal(before.upgradeA, null);
      assert.equal(before.upgradeB, null);
      const coinsAtMaximum = game.coins;
      assert.equal(game.upgrade(branch), false, 'level four is the maximum');
      assert.equal(game.coins, coinsAtMaximum);
      assert.equal(before.spent, totalSpent);

      const refund = before.sellValue;
      assert.ok(refund > 0 && refund < totalSpent, 'selling returns part of the actual investment');
      assert.equal(game.sell(), true);
      assert.equal(game.coins, budget - totalSpent + refund);
      assert.equal(game.getSnapshot().towerCount, 0);
      assert.equal(game.sell(), false, 'a sold defender cannot be refunded twice');
      assert.equal(game.coins, budget - totalSpent + refund);
      game.destroy();
    });
  }
}

test('an unaffordable upgrade preserves the defender, branch and coins', () => {
  const game = freshGame();
  assert.equal(game.build('pencil', 0), true);
  const before = selected(game);
  game.coins = before.upgradeA.cost - 1;
  const balance = game.coins;
  assert.equal(game.upgrade('a'), false);
  const after = selected(game);
  assert.equal(game.coins, balance);
  assert.equal(after.level, before.level);
  assert.equal(after.branch, before.branch);
  assert.equal(after.spent, before.spent);
  assert.ok(after.upgradeA && after.upgradeB, 'neither specialization is locked by a failed purchase');
  game.destroy();
});

test('the twenty-wave campaign schedules one boss every fifth wave and none between', () => {
  const game = freshGame();
  for (let wave = 1; wave <= game.maxWaves; wave++) {
    // Select a campaign wave without replaying preceding combat in this schedule test.
    game.phase = 'build';
    game.wave = wave - 1;
    assert.equal(game.startWave(), true);
    const bosses = game.queue.filter(item => item.type === 'boss');
    assert.equal(bosses.length, wave % 5 === 0 ? 1 : 0, `wave ${wave}`);
    assert.ok(game.queue.length > bosses.length, 'bosses have an accompanying invasion');
  }
  game.destroy();
});

function spawnWaveFiveBoss(game) {
  game.wave = 4;
  assert.equal(game.startWave(), true);
  let boss = null;
  for (let step = 0; step < 1_200 && !boss; step++) {
    game.update(0.05);
    boss = game.enemies.find(enemy => enemy.type === 'boss' && !enemy.dead);
  }
  assert.ok(boss, 'wave five must actually spawn its boss within a bounded simulation');
  assert.equal(game.phase, 'wave');
  return boss;
}

test('wave five spawns a live boss; damage updates its health and killing it rewards only once', () => {
  const game = freshGame();
  const boss = spawnWaveFiveBoss(game);
  const displayedBoss = game.getSnapshot().boss;
  assert.ok(displayedBoss, 'the live snapshot exposes the active boss for the HUD');
  assert.equal(displayedBoss.name, boss.name);
  assert.ok(displayedBoss.hp > 0 && displayedBoss.maxHp >= displayedBoss.hp);

  const originalHp = boss.hp;
  const before = game.getSnapshot();
  game.damage(boss, originalHp / 10, null, {ignoreArmor: true});
  assert.ok(boss.hp > 0 && boss.hp < originalHp);
  assert.ok(game.getSnapshot().boss.hp < displayedBoss.hp, 'the boss health display tracks combat damage');
  assert.equal(game.coins, before.coins, 'nonlethal damage does not pay a kill reward');
  assert.equal(game.kills, before.kills);

  game.damage(boss, originalHp * 2, null, {ignoreArmor: true});
  assert.equal(boss.dead, true);
  assert.equal(game.coins, before.coins + boss.reward);
  assert.equal(game.kills, before.kills + 1);
  assert.ok(game.score > before.score);
  const paidCoins = game.coins, paidScore = game.score;
  game.damage(boss, originalHp * 2, null, {ignoreArmor: true});
  assert.equal(game.coins, paidCoins, 'a dead boss cannot pay twice');
  assert.equal(game.score, paidScore);
  assert.equal(game.kills, before.kills + 1);
  assert.equal(game.getSnapshot().boss, null, 'a dead boss leaves the active-boss HUD');
  game.destroy();
});

test('a boss that reaches the exit removes its life cost once and grants no kill reward', () => {
  const game = freshGame();
  const boss = spawnWaveFiveBoss(game);
  // Isolate the exit event while keeping the wave open, so a completion bonus cannot obscure it.
  game.enemies = [boss];
  game.queue = [{type: 'dust', delay: 1_000}];
  game.spawnTimer = 1_000;
  boss.distance = game.pathLength - boss.speed * 0.01;
  const before = game.getSnapshot();
  assert.ok(boss.leak > 1, 'a boss costs more lives than an ordinary invader');
  game.update(0.05);
  assert.equal(game.lives, before.lives - boss.leak);
  assert.equal(game.kills, before.kills);
  assert.equal(game.coins, before.coins);
  assert.equal(game.enemies.length, 0);
  game.update(0.05);
  assert.equal(game.lives, before.lives - boss.leak, 'the escaped boss is not charged again');
  game.destroy();
});
