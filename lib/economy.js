const { MessageFlags } = require("discord.js");
const db = require("./database");
const logger = require("./logger");
const { expireKey } = require("./timers");
const { randomInt } = require("crypto");
const { config: defaults, guildValue } = require("./config");

const CURRENCY_NAME = "Golden Needles";
const CURRENCY_EMOJI = "🪡";
const CASINO_GAMES = ["coinflip", "dice", "slots", "blackjack"];
const POT_GAME = "pot";
const CASINO_FOOTER = "Just for fun. Golden Needles have no real value.";
const ALMS_THRESHOLD = defaults.almsThreshold;

const gameCooldowns = new Map();
const openBets = new Map();

function formatNeedles(amount) {
  return `${CURRENCY_EMOJI} **${amount.toLocaleString("en-US")}** ${CURRENCY_NAME}`;
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const upsertWalletStmt = db.prepare(
  `INSERT INTO wallets (user_id, guild_id, balance, last_daily_at, daily_streak, last_alms_at, total_wagered, total_won, games_played)
   VALUES (@user_id, @guild_id, @balance, @last_daily_at, @daily_streak, @last_alms_at, @total_wagered, @total_won, @games_played)
   ON CONFLICT(user_id, guild_id) DO UPDATE SET
     balance = excluded.balance, last_daily_at = excluded.last_daily_at,
     daily_streak = excluded.daily_streak, last_alms_at = excluded.last_alms_at,
     total_wagered = excluded.total_wagered, total_won = excluded.total_won,
     games_played = excluded.games_played`,
);
const updateWalletStmt = db.prepare(
  `UPDATE wallets SET balance = balance + @amount, total_wagered = total_wagered + @total_wagered,
   games_played = games_played + @games_played, updated_at = CURRENT_TIMESTAMP
   WHERE user_id = @user_id AND guild_id = @guild_id`,
);
const updateWalletManyStmt = db.prepare(
  `UPDATE wallets SET balance = balance - @amount, total_wagered = total_wagered + @amount,
   games_played = games_played + 1, updated_at = CURRENT_TIMESTAMP
   WHERE user_id = @user_id AND guild_id = @guild_id AND balance >= @amount`,
);
const findWalletStmt = db.prepare("SELECT * FROM wallets WHERE user_id = ? AND guild_id = ?");
const getTodayNetLossStmt = db.prepare(
  `SELECT COALESCE(SUM(bet), 0) AS total_bet, COALESCE(SUM(payout), 0) AS total_payout
   FROM gamble_logs WHERE user_id = ? AND guild_id = ? AND created_at >= ?`,
);

async function getCasinoConfig(guildId) {
  return getGuildStmt.get(guildId);
}

function getWallet(userId, guildId, config) {
  const row = findWalletStmt.get(userId, guildId);
  if (!row) {
    const startingBalance = config?.casino_starting_balance ?? 500;
    upsertWalletStmt.run({
      user_id: userId, guild_id: guildId, balance: startingBalance,
      last_daily_at: null, daily_streak: 0, last_alms_at: null,
      total_wagered: 0, total_won: 0, games_played: 0,
    });
    return findWalletStmt.get(userId, guildId);
  }
  return {
    id: row.id, userId: row.user_id, guildId: row.guild_id, balance: row.balance,
    lastDailyAt: row.last_daily_at, dailyStreak: row.daily_streak, lastAlmsAt: row.last_alms_at,
    totalWagered: row.total_wagered, totalWon: row.total_won, gamesPlayed: row.games_played,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function adjustBalance(userId, guildId, amount, config) {
  getWallet(userId, guildId, config);
  if (amount >= 0) {
    updateWalletStmt.run({ user_id: userId, guild_id: guildId, amount, total_wagered: 0, games_played: 0 });
    return getWallet(userId, guildId, config);
  }
  const result = updateWalletManyStmt.run({ user_id: userId, guild_id: guildId, amount: -amount });
  if (result.changes === 0) return null;
  return getWallet(userId, guildId, config);
}

async function getTodayNetLoss(userId, guildId) {
  const row = getTodayNetLossStmt.get(userId, guildId, startOfUtcDay().toISOString());
  return (row.total_bet || 0) - (row.total_payout || 0);
}

function replyError(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function requireCasino(interaction) {
  const config = await getCasinoConfig(interaction.guildId);
  if (!config?.module_casino_enabled) {
    await replyError(interaction, "Casino games are turned off in this server.");
    return null;
  }
  return config;
}

async function startGame(interaction, game, bet) {
  const config = await requireCasino(interaction);
  if (!config) return null;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const enabledGames = config.casino_games_enabled ? JSON.parse(config.casino_games_enabled) : CASINO_GAMES;
  if (!enabledGames.includes(game)) {
    await replyError(interaction, `/${game} is turned off in this server.`);
    return null;
  }
  if (config.gamble_channel_id && interaction.channelId !== config.gamble_channel_id) {
    await replyError(interaction, `Casino games only work in <#${config.gamble_channel_id}>.`);
    return null;
  }
  if (bet < config.casino_min_bet || bet > config.casino_max_bet) {
    await replyError(interaction, `Bets must be between ${formatNeedles(config.casino_min_bet)} and ${formatNeedles(config.casino_max_bet)}.`);
    return null;
  }

  const key = `${guildId}-${userId}`;
  const cooldownMs = config.casino_cooldown_seconds * 1000;
  const lastGame = gameCooldowns.get(key);
  if (lastGame && Date.now() - lastGame < cooldownMs) {
    const readyAt = Math.ceil((lastGame + cooldownMs) / 1000);
    await replyError(interaction, `Slow down! You can play again <t:${readyAt}:R>.`);
    return null;
  }

  if (config.casino_daily_loss_cap > 0) {
    const lostToday = await getTodayNetLoss(userId, guildId);
    if (lostToday >= config.casino_daily_loss_cap) {
      const resetAt = Math.floor(startOfUtcDay().getTime() / 1000) + 86400;
      await replyError(interaction, `You've hit today's loss limit of ${formatNeedles(config.casino_daily_loss_cap)}. Games unlock <t:${resetAt}:R>.`);
      return null;
    }
  }

  const wallet = getWallet(userId, guildId, config);
  const result = updateWalletManyStmt.run({ user_id: userId, guild_id: guildId, amount: bet });
  if (result.changes === 0) {
    await replyError(interaction, `You only have ${formatNeedles(wallet.balance)}. Try a smaller bet, or claim /daily.`);
    return null;
  }

  gameCooldowns.set(key, Date.now());
  expireKey(gameCooldowns, key, cooldownMs);
  return config;
}

function finishGame(userId, guildId, game, bet, payout) {
  db.prepare(
    `UPDATE wallets SET balance = balance + @payout, total_won = total_won + @payout, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = @user_id AND guild_id = @guild_id`,
  ).run({ user_id: userId, guild_id: guildId, payout });
  db.prepare("INSERT INTO gamble_logs (guild_id, user_id, game, bet, payout) VALUES (@guild_id, @user_id, @game, @bet, @payout)").run({
    guild_id: guildId, user_id: userId, game, bet, payout,
  });
  return getWallet(userId, guildId, defaults).balance;
}

const BIG_WIN_RESOLUTION = 1_000_000;
function rollBigWin(bet) {
  const hits = Math.round(Math.min(defaults.casinoBigWinChance, 1) * BIG_WIN_RESOLUTION);
  if (hits <= 0) return 0;
  if (!(randomInt(BIG_WIN_RESOLUTION) >= BIG_WIN_RESOLUTION - hits)) return 0;
  return Math.floor(bet * defaults.casinoBigWinMultiplier);
}

function refundBet(userId, guildId, bet) {
  db.prepare(
    `UPDATE wallets SET balance = balance + @bet, total_wagered = total_wagered - @bet,
     games_played = games_played - 1, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = @user_id AND guild_id = @guild_id`,
  ).run({ user_id: userId, guild_id: guildId, bet });
}

function raiseBet(userId, guildId, amount) {
  const result = db.prepare(
    `UPDATE wallets SET balance = balance - @amount, total_wagered = total_wagered + @amount, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = @user_id AND guild_id = @guild_id AND balance >= @amount`,
  ).run({ user_id: userId, guild_id: guildId, amount });
  return result.changes === 1;
}

function trackOpenBet(userId, guildId, bet) {
  openBets.set(`${guildId}-${userId}`, { userId, guildId, bet });
}

function clearOpenBet(userId, guildId) {
  openBets.delete(`${guildId}-${userId}`);
}

function hasOpenBet(userId, guildId) {
  return openBets.has(`${guildId}-${userId}`);
}

function refundOpenBets() {
  for (const { userId, guildId, bet } of openBets.values()) {
    try { refundBet(userId, guildId, bet); } catch (error) {
      logger.error(`[ERROR] Failed to refund open bet for ${userId}:`, error);
    }
  }
  if (openBets.size > 0) logger.info(`[INFO] Refunded ${openBets.size} unfinished casino game(s).`);
  openBets.clear();
}

function claimDaily(userId, guildId, config) {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const maxStreakDays = guildValue(config, "max_streak_days", defaults.maxStreakDays);
  const almsThreshold = guildValue(config, "alms_threshold", defaults.almsThreshold);
  const almsAmount = guildValue(config, "alms_amount", defaults.almsAmount);
  const almsIntervalMs = guildValue(config, "alms_interval_hours", defaults.almsIntervalMs, 60 * 60 * 1000);
  const wallet = getWallet(userId, guildId, config);

  if (!wallet.lastDailyAt || new Date(wallet.lastDailyAt) < todayStart) {
    const streak = wallet.lastDailyAt && new Date(wallet.lastDailyAt) >= yesterdayStart ? wallet.dailyStreak + 1 : 1;
    const amount = config.casino_daily_amount + config.casino_streak_bonus * Math.min(streak - 1, maxStreakDays);
    const result = db.prepare(
      `UPDATE wallets SET balance = balance + @amount, last_daily_at = @now, daily_streak = @streak, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = @user_id AND guild_id = @guild_id AND (last_daily_at IS NULL OR last_daily_at < @todayStart)`,
    ).run({ user_id: userId, guild_id: guildId, amount, now: now.toISOString(), streak, todayStart: todayStart.toISOString() });
    if (result.changes === 1) return { type: "daily", amount, streak, wallet: getWallet(userId, guildId, config) };
  }

  const fresh = getWallet(userId, guildId, config);
  const almsReadyAt = fresh.lastAlmsAt ? new Date(new Date(fresh.lastAlmsAt).getTime() + almsIntervalMs) : now;
  if (fresh.balance < almsThreshold && almsReadyAt <= now) {
    const result = db.prepare(
      `UPDATE wallets SET balance = balance + @amount, last_alms_at = @now, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = @user_id AND guild_id = @guild_id AND balance < @threshold
       AND (last_alms_at IS NULL OR last_alms_at <= @cutoff)`,
    ).run({ user_id: userId, guild_id: guildId, amount: almsAmount, now: now.toISOString(), threshold: almsThreshold, cutoff: new Date(now.getTime() - almsIntervalMs).toISOString() });
    if (result.changes === 1) return { type: "alms", amount: almsAmount, wallet: getWallet(userId, guildId, config) };
  }

  const nextDaily = new Date(todayStart.getTime() + 86400000);
  const nextAt = fresh.balance < almsThreshold && almsReadyAt < nextDaily ? almsReadyAt : nextDaily;
  return { type: "wait", wallet: fresh, nextAt };
}

module.exports = {
  CURRENCY_NAME, CURRENCY_EMOJI, CASINO_GAMES, POT_GAME, CASINO_FOOTER, ALMS_THRESHOLD,
  formatNeedles, getCasinoConfig, getWallet, adjustBalance, requireCasino, replyError,
  startGame, finishGame, rollBigWin, refundBet, raiseBet, trackOpenBet, clearOpenBet,
  hasOpenBet, refundOpenBets, claimDaily,
};
