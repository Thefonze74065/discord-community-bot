const path = require("path");
const fs = require("fs");

let Database;
try {
  Database = require("better-sqlite3");
} catch (e) {
  Database = null;
}

let dbInstance;

// In-memory store used when better-sqlite3 isn't available (e.g. Node 26)
const memStore = {
  wallets: new Map(),
  gambleLogs: [],
  guilds: new Map(),
  userLevels: new Map(),
  levelRewards: [],
};

const walletDefaults = {
  balance: 0,
  total_wagered: 0,
  total_won: 0,
  games_played: 0,
  daily_streak: 0,
  last_daily_at: null,
  last_alms_at: null,
};

class MockStatement {
  constructor(sql) {
    this.sql = sql.trim().replace(/\s+/g, " ");
  }

  get(...params) {
    const sql = this.sql;
    if (sql.startsWith("SELECT * FROM guilds WHERE id = ?")) {
      return memStore.guilds.get(params[0]) ?? null;
    }
    if (sql.startsWith("SELECT * FROM wallets WHERE user_id = ? AND guild_id = ?")) {
      const k = `${params[1]}:${params[0]}`;
      return memStore.wallets.has(k) ? { ...memStore.wallets.get(k) } : null;
    }
    if (sql.startsWith("SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?")) {
      const k = `${params[1]}:${params[0]}`;
      return memStore.userLevels.get(k) ?? null;
    }
    if (sql.includes("FROM gamble_logs") && sql.includes("SUM")) {
      const [userId, guildId, today] = params;
      const rows = memStore.gambleLogs.filter(
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
      memStore.wallets.set(k, { ...walletDefaults, ...params });
      return { changes: 1, lastInsertRowid: 1 };
    }
    if (sql.startsWith("UPDATE wallets SET balance = balance + @amount, total_wagered = total_wagered + @total_wagered")) {
      const k = `${params.guild_id}:${params.user_id}`;
      const row = memStore.wallets.get(k);
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
      const row = memStore.wallets.get(k);
      if (!row || row.balance < params.amount) return { changes: 0 };
      row.balance -= params.amount;
      row.total_wagered += params.amount;
      row.games_played += 1;
      row.updated_at = new Date().toISOString();
      return { changes: 1 };
    }
    if (sql.startsWith("UPDATE wallets SET balance = balance + @payout")) {
      const k = `${params.guild_id}:${params.user_id}`;
      const row = memStore.wallets.get(k);
      row.balance += params.payout;
      row.total_won += params.payout;
      row.updated_at = new Date().toISOString();
      return { changes: 1 };
    }
    if (sql.startsWith("INSERT INTO gamble_logs")) {
      memStore.gambleLogs.push({
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
      const row = memStore.wallets.get(k);
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
      const row = memStore.wallets.get(k);
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
      const row = memStore.wallets.get(k);
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
      const row = memStore.wallets.get(k);
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
      module.exports.dailyUpserts.push(params);
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

function createDatabase() {
  try {
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "database.sqlite");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    const schemaPath = path.join(__dirname, "..", "schema.sql");
    db.exec(fs.readFileSync(schemaPath, "utf8"));
    return db;
  } catch (e) {
    return null;
  }
}

module.exports = {
  prepare: (sql) => {
    if (!dbInstance) {
      if (!Database) return new MockStatement(sql);
      dbInstance = createDatabase();
      if (!dbInstance) return new MockStatement(sql);
    }
    return dbInstance.prepare(sql);
  },
  exec: (sql) => {
    if (!dbInstance) {
      if (!Database) return undefined;
      dbInstance = createDatabase();
    }
    return dbInstance.exec(sql);
  },
  dailyUpserts: [],
};

let failRun = false;

module.exports.setFailMode = (val) => {
  failRun = val;
};

// Export for tests
module.exports.__memStore__ = memStore;
