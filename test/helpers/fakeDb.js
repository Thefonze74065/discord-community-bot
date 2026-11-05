// Test helpers backed by lib/database.js's in-memory mock store.
// Shares the same storage as lib/database.js's mock, so lib/economy.js
// and other modules see the same data.
const db = require("../../lib/database");
const { __memStore__: memStore } = db;

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

function reset(guildOverrides = {}) {
  wallets.clear();
  gambleLogs.length = 0;
  guilds.clear();
  guilds.set("guild-1", { ...defaultGuild, ...guildOverrides });
}

function setWallet(userId, guildId, fields) {
  const row = { ...walletDefaults, user_id: userId, guild_id: guildId, ...fields };
  wallets.set(walletKey(row), row);
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
}

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
