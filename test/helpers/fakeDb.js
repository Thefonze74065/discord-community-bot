// Test helpers backed by lib/database.js's in-memory mock store.
// Replaces lib/database.js in the require cache so that lib/economy.js,
// lib/leveling.js, and other modules use the mock instead of real SQLite.
// This keeps tests deterministic and working on Node versions where
// better-sqlite3 has no prebuilt binary (e.g. Node 26) and on CI (Node 22).
const path = require("node:path");

const dbModulePath = require.resolve("../../lib/database.js");

// Load the real module first (to get __memStore__ reference), then replace it.
const realDb = require(dbModulePath);
const { __memStore__: memStore } = realDb;

// Build a mock database object that mirrors the real exports but uses memStore.
const wallets = memStore.wallets;
const gambleLogs = memStore.gambleLogs;
let guilds = memStore.guilds;

const walletKey = (w) => `${w.guild_id}:${w.user_id}`;

const walletDefaults = {
  balance: 0,
  total_wagered: 0,
  total_won: 0,
  games_played: 0,
  daily_streak: 0,
  last_daily_at: null,
  last_alms_at: null,
};

let failRun = false;

class MockStatement {
  constructor(sql) {
    this.sql = sql.trim().replace(/\s+/g, " ");
  }

  get(...params) {
    const sql = this.sql;
    if (sql.startsWith("SELECT * FROM guilds WHERE id = ?")) {
      return guilds.get(params[0]) ?? null;
    }
    if (sql.startsWith("SELECT * FROM wallets WHERE user_id = ? AND guild_id = ?")) {
      const k = `${params[1]}:${params[0]}`;
      return wallets.has(k) ? { ...wallets.get(k) } : null;
    }
    if (sql.startsWith("SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?")) {
      const k = `${params[1]}:${params[0]}`;
      return memStore.userLevels.get(k) ?? null;
    }
    if (sql.includes("FROM gamble_logs") && sql.includes("SUM")) {
      const [userId, guildId, today] = params;
      const rows = gambleLogs.filter(
        (l) => l.userId === userId && l.guildId === guildId && l.createdAt === today,
      );
      const total_bet = rows.reduce((s, l) => s + l.bet, 0);
      const total_payout = rows.reduce((s, l) => s + l.payout, 0);
      return { total_bet, total_payout };
    }
    if (sql.startsWith("SELECT * FROM level_rewards WHERE guild_id = ?")) {
      const guildId = params[0];
      const minLevel = params[1];
      const rewards = memStore.levelRewards.filter(
        (r) => r.guild_id === guildId && (minLevel === undefined || r.level > minLevel),
      );
      rewards.sort((a, b) => a.level - b.level);
      return minLevel === undefined ? rewards[0] ?? null : rewards[0] ?? null;
    }
    throw new Error(`Unsupported GET: ${this.sql}`);
  }

  run(params) {
    if (failRun) throw new Error("db down");
    const sql = this.sql;
    if (sql.startsWith("INSERT INTO wallets")) {
      const k = `${params.guild_id}:${params.user_id}`;
      wallets.set(k, { ...walletDefaults, ...params });
      return { changes: 1, lastInsertRowid: 1 };
    }
    if (sql.startsWith("UPDATE wallets SET balance = balance + @amount, total_wagered = total_wagered + @total_wagered")) {
      const k = `${params.guild_id}:${params.user_id}`;
      const row = wallets.get(k);
      if (!row) return { changes: 0 };
      row.balance += params.amount;
      row.total_wagered += params.total_wagered || 0;
      row.games_played += params.games_played || 0;
      row.updated_at = new Date().toISOString();
      return { changes: 1 };
    }
    if (
      sql.startsWith("UPDATE wallets SET balance = balance - @amount, total_wagered = total_wagered + @amount, games_played = games_played + 1")
    ) {
      const k = `${params.guild_id}:${params.user_id}`;
      const row = wallets.get(k);
      if (!row || row.balance < params.amount) return { changes: 0 };
      row.balance -= params.amount;
      row.total_wagered += params.amount;
      row.games_played += 1;
      row.updated_at = new Date().toISOString();
      return { changes: 1 };
    }
    if (sql.startsWith("UPDATE wallets SET balance = balance + @payout")) {
      const k = `${params.guild_id}:${params.user_id}`;
      const row = wallets.get(k);
      row.balance += params.payout;
      row.total_won += params.payout;
      row.updated_at = new Date().toISOString();
      return { changes: 1 };
    }
    if (sql.startsWith("INSERT INTO gamble_logs")) {
      gambleLogs.push({
        userId: params.user_id,
        guildId: params.guild_id,
        game: params.game,
        bet: params.bet,
        payout: params.payout,
        createdAt: params.created_at,
      });
      return { changes: 1 };
    }
    if (
      sql.startsWith(
        "UPDATE wallets SET balance = balance + @bet, total_wagered = total_wagered - @bet, games_played = games_played - 1"
      )
    ) {
      const k = `${params.guild_id}:${params.user_id}`;
      const row = wallets.get(k);
      row.balance += params.bet;
      row.total_wagered -= params.bet;
      row.games_played -= 1;
      row.updated_at = new Date().toISOString();
      return { changes: 1 };
    }
    if (
      sql.startsWith(
        "UPDATE wallets SET balance = balance - @amount, total_wagered = total_wagered + @amount, updated_at = CURRENT_TIMESTAMP WHERE user_id = @user_id AND guild_id = @guild_id AND balance >= @amount"
      )
    ) {
      const k = `${params.guild_id}:${params.user_id}`;
      const row = wallets.get(k);
      if (!row || row.balance < params.amount) return { changes: 0 };
      row.balance -= params.amount;
      row.total_wagered += params.amount;
      row.updated_at = new Date().toISOString();
      return { changes: 1 };
    }
    if (
      sql.startsWith(
        "UPDATE wallets SET balance = balance + @amount, last_daily_at = @now, daily_streak = @streak"
      )
    ) {
      const k = `${params.guild_id}:${params.user_id}`;
      const row = wallets.get(k);
      if (!row) return { changes: 0 };
      row.balance += params.amount;
      row.last_daily_at = params.now;
      row.daily_streak = params.streak;
      row.updated_at = new Date().toISOString();
      return { changes: 1 };
    }
    if (
      sql.startsWith(
        "UPDATE wallets SET balance = balance + @amount, last_alms_at = @now"
      )
    ) {
      const k = `${params.guild_id}:${params.user_id}`;
      const row = wallets.get(k);
      if (!row || row.balance < params.threshold) return { changes: 0 };
      row.balance += params.amount;
      row.last_alms_at = params.now;
      row.updated_at = new Date().toISOString();
      return { changes: 1 };
    }
    if (sql.startsWith("INSERT INTO user_levels")) {
      const k = `${params.guild_id}:${params.user_id}`;
      memStore.userLevels.set(k, { ...params });
      return { changes: 1 };
    }
    if (sql.startsWith("INSERT INTO user_daily_activities")) {
      realDb.dailyUpserts.push(params);
      return { changes: 1 };
    }
    throw new Error(`Unsupported RUN: ${this.sql}`);
  }

  all(...params) {
    if (this.sql.startsWith("SELECT * FROM level_rewards WHERE guild_id = ?")) {
      const guildId = params[0];
      return memStore.levelRewards.filter((r) => r.guild_id === guildId);
    }
    return [];
  }
}

const mockDb = {
  prepare: (sql) => new MockStatement(sql),
  exec: () => undefined,
  dailyUpserts: realDb.dailyUpserts,
  setFailMode: (val) => { failRun = val; },
  __memStore__: memStore,
};

// Replace lib/database.js in the require cache so all consumers get the mock.
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: mockDb,
};

const walletKeyForSet = (userId, guildId) => `${guildId}:${userId}`;

function reset(guildOverrides = {}) {
  wallets.clear();
  gambleLogs.length = 0;
  guilds.clear();
  guilds.set("guild-1", { ...defaultGuild, ...guildOverrides });
}

function setWallet(userId, guildId, fields) {
  const row = { ...walletDefaults, user_id: userId, guild_id: guildId, ...fields };
  wallets.set(walletKeyForSet(userId, guildId), row);
  return toCamel(row);
}

function toCamel(row) {
  return {
    id: row.id,
    userId: row.user_id,
    guildId: row.guild_id,
    balance: row.balance,
    lastDailyAt: row.last_daily_at,
    dailyStreak: row.daily_streak,
    lastAlmsAt: row.last_alms_at,
    totalWagered: row.total_wagered,
    totalWon: row.total_won,
    gamesPlayed: row.games_played,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const getWallet = (userId, guildId = "guild-1") => {
  const row = wallets.get(`${guildId}:${userId}`);
  return row ? toCamel(row) : row;
};

const defaultGuild = {
  id: "guild-1",
  module_casino_enabled: 1,
  casino_games_enabled: '["coinflip","dice","slots","blackjack"]',
  gamble_channel_id: null,
  casino_min_bet: 1,
  casino_max_bet: 10000,
  casino_cooldown_seconds: 0,
  casino_daily_loss_cap: 0,
  casino_starting_balance: 1000,
  casino_daily_amount: 200,
  casino_streak_bonus: 25,
};

reset();

module.exports = { reset, setWallet, getWallet, gambleLogs };
