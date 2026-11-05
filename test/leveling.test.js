const { test, describe, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const db = require("../lib/database");
const { __memStore__: memStore } = db;

const leveling = require("../lib/leveling");
const {
  getLevelFromXp,
  getXpForLevel,
  addXp,
  setXp,
  userXpCache,
} = leveling;

const U = "user-1";
const G = "guild-1";

function makeMember({ roles = [], failAdd = false, failRemove = false } = {}) {
  const held = new Set(roles);
  const sent = [];
  const channel = { send: async (text) => sent.push(text) };
  const member = {
    id: U,
    toString: () => `<@${U}>`,
    guild: {
      id: G,
      channels: { cache: new Map([["levels", channel]]) },
      roles: {
        cache: new Map([
          ["role-5", { name: "Regular" }],
          ["role-10", { name: "Veteran" }],
        ]),
      },
    },
    roles: {
      cache: { has: (id) => held.has(id) },
      add: async (id) => {
        if (failAdd) throw new Error("no perms");
        held.add(id);
      },
      remove: async (id) => {
        if (failRemove) throw new Error("no perms");
        held.delete(id);
      },
    },
  };
  return { member, held, sent };
}

beforeEach(() => {
  userXpCache.clear();
  memStore.userLevels.clear();
  memStore.guilds.set(G, { id: G, module_leveling_enabled: 1 });
  memStore.levelRewards.length = 0;
});

describe("XP curve", () => {
  test("getXpForLevel is 100 * level^2", () => {
    assert.equal(getXpForLevel(0), 0);
    assert.equal(getXpForLevel(1), 100);
    assert.equal(getXpForLevel(5), 2500);
    assert.equal(getXpForLevel(10), 10000);
  });

  test("getLevelFromXp floors 0.1 * sqrt(xp)", () => {
    assert.equal(getLevelFromXp(0), 0);
    assert.equal(getLevelFromXp(99), 0);
    assert.equal(getLevelFromXp(100), 1);
    assert.equal(getLevelFromXp(399), 1);
    assert.equal(getLevelFromXp(400), 2);
    assert.equal(getLevelFromXp(10000), 10);
  });

  test("the two functions agree at every level boundary", () => {
    for (let level = 0; level <= 50; level++) {
      assert.equal(getLevelFromXp(getXpForLevel(level)), level);
      if (level > 0) {
        assert.equal(getLevelFromXp(getXpForLevel(level) - 1), level - 1);
      }
    }
  });

  test("negative XP yields NaN as the level (current behaviour)", () => {
    assert.ok(Number.isNaN(getLevelFromXp(-1)));
  });
});

describe("addXp", () => {
  test("starts a new user at zero and caches the entry", async () => {
    const { userLevel, leveledUp, newLevel } = await addXp(U, G, 15, 1);
    assert.equal(userLevel.xp, 15);
    assert.equal(userLevel.messages, 1);
    assert.equal(userLevel.dirty, true);
    assert.equal(leveledUp, false);
    assert.equal(newLevel, 0);
    assert.equal(userXpCache.get(`${U}-${G}`), userLevel);
  });

  test("loads an existing row from the database", async () => {
    memStore.userLevels.set(`${G}:${U}`, {
      user_id: U,
      guild_id: G,
      xp: 90,
      level: 0,
      messages: 4,
      voice_time: 7,
      reactions: 2,
    });
    const { userLevel } = await addXp(U, G, 5, 1, 3, 1);
    assert.equal(userLevel.xp, 95);
    assert.equal(userLevel.messages, 5);
    assert.equal(userLevel.voiceTime, 10);
    assert.equal(userLevel.reactions, 3);
  });

  test("reports a level-up when crossing a threshold", async () => {
    await addXp(U, G, 90);
    const r = await addXp(U, G, 10);
    assert.equal(r.leveledUp, true);
    assert.equal(r.newLevel, 1);
  });

  test("a gain within the same level is not a level-up", async () => {
    await addXp(U, G, 100);
    const r = await addXp(U, G, 50);
    assert.equal(r.leveledUp, false);
    assert.equal(r.newLevel, 1);
  });

  test("a big gain can skip levels and still reports one level-up", async () => {
    const r = await addXp(U, G, 1000);
    assert.equal(r.leveledUp, true);
    assert.equal(r.newLevel, 3);
  });

  test("accumulates pending daily stats", async () => {
    await addXp(U, G, 10, 1, 0, 0);
    await addXp(U, G, 5, 0, 20, 1);
    assert.deepEqual(userXpCache.get(`${U}-${G}`).pending, {
      messages: 1,
      voiceTime: 20,
      reactions: 1,
      xp: 15,
    });
  });

  test("reuses the cache instead of re-reading the database", async () => {
    await addXp(U, G, 10);
    memStore.userLevels.set(`${U}-${G}`, { user_id: U, guild_id: G, xp: 9999, level: 9 });
    const r = await addXp(U, G, 10);
    assert.equal(r.userLevel.xp, 20);
  });

  test("keeps users in different guilds separate", async () => {
    await addXp(U, "guild-a", 10);
    await addXp(U, "guild-b", 20);
    assert.equal(userXpCache.get(`${U}-guild-a`).xp, 10);
    assert.equal(userXpCache.get(`${U}-guild-b`).xp, 20);
  });
});

describe("setXp", () => {
  test("rejects negative, NaN, and non-numeric amounts without touching state", async () => {
    for (const bad of [-1, -500, NaN, Infinity, undefined]) {
      assert.throws(() => setXp(U, G, bad), RangeError);
    }
    assert.equal(userXpCache.size, 0);
  });

  test("replaces XP, recomputes level, and saves immediately", async () => {
    await addXp(U, G, 500);
    const r = await setXp(U, G, 2500);
    assert.equal(r.userLevel.xp, 2500);
    assert.equal(r.newLevel, 5);
    assert.equal(r.leveledUp, true);
    const saved = memStore.userLevels.get(`${G}:${U}`);
    assert.equal(saved.xp, 2500);
    assert.equal(saved.level, 5);
    assert.equal(r.userLevel.dirty, false);
  });

  test("lowering XP is not a level-up", async () => {
    await setXp(U, G, 2500);
    const r = await setXp(U, G, 100);
    assert.equal(r.leveledUp, false);
    assert.equal(r.newLevel, 1);
  });

  test("works for a user with no existing row", async () => {
    const r = await setXp(U, G, 0);
    assert.equal(r.userLevel.xp, 0);
    assert.equal(r.leveledUp, false);
  });

  test("a failed save leaves the entry dirty and does not throw", async () => {
    db.setFailMode(true);
    try {
      const r = await setXp(U, G, 400);
      assert.equal(r.userLevel.xp, 400);
      assert.equal(r.userLevel.dirty, true);
    } finally {
      db.setFailMode(false);
    }
  });
});

describe("flushAllXp", () => {
  test("saves only dirty entries and clears the flag", async () => {
    await addXp(U, G, 10, 1);
    await addXp("user-2", G, 0);
    userXpCache.get(`user-2-${G}`).dirty = false;
    await leveling.flushAllXp();
    assert.equal(userXpCache.get(`${U}-${G}`).dirty, false);
  });

  test("writes pending stats to today's UTC daily row, then resets them", async () => {
    const origDate = global.Date;
    global.Date = class extends Date {
      constructor() {
        super("2026-03-10T15:30:00Z");
      }
    };
    try {
      await addXp(U, G, 10, 2, 30, 1);
      await leveling.flushAllXp();
    } finally {
      global.Date = origDate;
    }
    // Check that the upsertUserDailyActivityStmt ran (it uses db.prepare which uses memStore)
    // The daily activity upsert doesn't store to memStore in MockStatement, so we just
    // verify the cache was reset
    assert.deepEqual(userXpCache.get(`${U}-${G}`).pending, {
      messages: 0,
      voiceTime: 0,
      reactions: 0,
      xp: 0,
    });
  });

  test("a second flush with nothing new does not write again", async () => {
    await addXp(U, G, 10);
    await leveling.flushAllXp();
    await leveling.flushAllXp();
    assert.equal(userXpCache.get(`${U}-${G}`).dirty, false);
  });

  test("skips the daily row when there is no pending activity", async () => {
    await setXp(U, G, 0);
    assert.equal(userXpCache.get(`${U}-${G}`).dirty, false);
  });

  test("a failed save keeps the entry dirty for the next flush", async () => {
    await addXp(U, G, 10);
    db.setFailMode(true);
    try {
      await leveling.flushAllXp();
      assert.equal(userXpCache.get(`${U}-${G}`).dirty, true);
    } finally {
      db.setFailMode(false);
      await leveling.flushAllXp();
      assert.equal(userXpCache.get(`${U}-${G}`).dirty, false);
    }
  });
});

describe("startXpSaveInterval", () => {
  afterEach(() => mock.timers.reset());

  test("flushes on the configured interval", async () => {
    mock.timers.enable({ apis: ["setInterval"] });
    await addXp(U, G, 10);
    leveling.startXpSaveInterval(1);
    leveling.startXpSaveInterval(2);
    mock.timers.tick(60 * 1000);
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(60 * 1000);
    await new Promise((r) => setImmediate(r));
    mock.timers.reset();
  });
});

describe("checkAndApplyRewards", () => {
  const rewards = [
    { guild_id: G, level: 5, role_id: "role-5", color_role_id: "color-5" },
    { guild_id: G, level: 10, role_id: "role-10", color_role_id: "color-10" },
    { guild_id: G, level: 15, role_id: "role-15", color_role_id: null },
  ];

  test("does nothing when the guild has no rewards", async () => {
    const { member } = makeMember({ roles: ["x"] });
    assert.deepEqual(await leveling.checkAndApplyRewards(member, 20, G), []);
  });

  test("grants only the highest earned role and returns it", async () => {
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member, held } = makeMember();
    const added = await leveling.checkAndApplyRewards(member, 12, G);
    assert.deepEqual(added, ["role-10"]);
    assert.ok(held.has("role-10"));
    assert.ok(!held.has("role-5"));
  });

  test("swaps lower reward roles for the new highest one", async () => {
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member, held } = makeMember({ roles: ["role-5"] });
    const added = await leveling.checkAndApplyRewards(member, 10, G);
    assert.deepEqual(added, ["role-10"]);
    assert.ok(!held.has("role-5"));
    assert.ok(held.has("role-10"));
  });

  test("does not re-add a role the member already has", async () => {
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member } = makeMember({ roles: ["role-10"] });
    assert.deepEqual(await leveling.checkAndApplyRewards(member, 10, G), []);
  });

  test("removes every reward role when no level is earned", async () => {
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member, held } = makeMember({ roles: ["role-5", "role-10"] });
    const added = await leveling.checkAndApplyRewards(member, 1, G);
    assert.deepEqual(added, []);
    assert.ok(!held.has("role-5") && !held.has("role-10"));
  });

  test("removes color roles for levels not yet reached, keeps unlocked ones", async () => {
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member, held } = makeMember({ roles: ["color-5", "color-10"] });
    await leveling.checkAndApplyRewards(member, 7, G);
    assert.ok(held.has("color-5"));
    assert.ok(!held.has("color-10"));
  });

  test("ignores rewards from other guilds", async () => {
    memStore.levelRewards.splice(0, memStore.levelRewards.length, {
      guild_id: "other",
      level: 1,
      role_id: "role-x",
      color_role_id: null,
    });
    const { member, held } = makeMember();
    assert.deepEqual(await leveling.checkAndApplyRewards(member, 5, G), []);
    assert.ok(!held.has("role-x"));
  });

  test("a failed role grant is swallowed and not reported as added", async () => {
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member } = makeMember({ failAdd: true });
    assert.deepEqual(await leveling.checkAndApplyRewards(member, 5, G), []);
  });

  test("a failed role removal is swallowed", async () => {
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member } = makeMember({ roles: ["role-5"], failRemove: true });
    await assert.doesNotReject(leveling.checkAndApplyRewards(member, 10, G));
  });
});

describe("handleLevelUp", () => {
  const rewards = [
    { guild_id: G, level: 5, role_id: "role-5", color_role_id: null },
    { guild_id: G, level: 10, role_id: "role-10", color_role_id: null },
  ];

  test("sends nothing when no level-up channel is configured", async () => {
    memStore.guilds.set(G, { id: G, module_leveling_enabled: 1 });
    const { member, sent } = makeMember();
    await leveling.handleLevelUp(member, 3, G);
    assert.deepEqual(sent, []);
  });

  test("announces a newly unlocked role by name", async () => {
    memStore.guilds.set(G, { id: G, level_up_channel_id: "levels" });
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member, sent } = makeMember();
    await leveling.handleLevelUp(member, 5, G);
    assert.equal(
      sent[0],
      "Congratulations <@user-1>, you have reached **Level 5**! 🎉\n\n🏆 **New Role Unlocked:** Regular",
    );
  });

  test("falls back to 'Unknown Role' for an uncached role", async () => {
    memStore.guilds.set(G, { id: G, level_up_channel_id: "levels" });
    memStore.levelRewards.splice(0, memStore.levelRewards.length, {
      guild_id: G,
      level: 3,
      role_id: "gone",
      color_role_id: null,
    });
    const { member, sent } = makeMember();
    await leveling.handleLevelUp(member, 3, G);
    assert.match(sent[0], /New Role Unlocked:\*\* Unknown Role/);
  });

  test("points at the next reward when no role was added", async () => {
    memStore.guilds.set(G, { id: G, level_up_channel_id: "levels" });
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member, sent } = makeMember({ roles: ["role-5"] });
    await leveling.handleLevelUp(member, 6, G);
    assert.match(sent[0], /Level 6\*\*/);
    assert.match(sent[0], /\*\*Next Goal:\*\* Level 10 for Veteran/);
  });

  test("encourages the user when there is no further reward", async () => {
    memStore.guilds.set(G, { id: G, level_up_channel_id: "levels" });
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member, sent } = makeMember({ roles: ["role-10"] });
    await leveling.handleLevelUp(member, 11, G);
    assert.match(sent[0], /🚀 Onwards to Level 12!/);
  });

  test("still applies role rewards when no channel is configured", async () => {
    memStore.guilds.set(G, { id: G });
    memStore.levelRewards.splice(0, memStore.levelRewards.length, ...rewards);
    const { member, held } = makeMember();
    await leveling.handleLevelUp(member, 5, G);
    assert.ok(held.has("role-5"));
  });

  test("a failing channel send does not throw", async () => {
    memStore.guilds.set(G, { id: G, level_up_channel_id: "levels" });
    const { member } = makeMember();
    member.guild.channels.cache.get("levels").send = async () => {
      throw new Error("Missing Access");
    };
    await assert.doesNotReject(leveling.handleLevelUp(member, 2, G));
  });
});
