const logger = require("./logger");

/**
 * Runtime tunables (cooldowns, intervals, thresholds, amounts). Each has a
 * default equal to the value that used to be hardcoded at its call site, and
 * can be overridden with the environment variable named in `env`.
 * Per-guild settings (e.g. casino daily amount) stay in the database config.
 */
const DEFINITIONS = {
  messageXpCooldownSeconds: {
    env: "BOT_MESSAGE_XP_COOLDOWN_SECONDS",
    default: 30,
  },
  reactionXpCooldownSeconds: {
    env: "BOT_REACTION_XP_COOLDOWN_SECONDS",
    default: 30,
  },
  casinoChatDripAmount: { env: "BOT_CASINO_CHAT_DRIP_AMOUNT", default: 1 },
  // Chance (0 to 1) that any casino game is a guaranteed big win; 0 turns it off
  casinoBigWinChance: { env: "BOT_CASINO_BIG_WIN_CHANCE", default: 0.001 },
  casinoBigWinMultiplier: {
    env: "BOT_CASINO_BIG_WIN_MULTIPLIER",
    default: 100,
  },
  // Table blackjack: cap on total bets per table, seats, and timers
  casinoPotCap: { env: "BOT_CASINO_POT_CAP", default: 25000 },
  potMaxPlayers: { env: "BOT_POT_MAX_PLAYERS", default: 6 },
  potTurnTimeoutMs: { env: "BOT_POT_TURN_TIMEOUT_MS", default: 60 * 1000 },
  potLobbyTimeoutMs: {
    env: "BOT_POT_LOBBY_TIMEOUT_MS",
    default: 2 * 60 * 1000,
  },
  xpSaveIntervalMinutes: { env: "BOT_XP_SAVE_INTERVAL_MINUTES", default: 10 },
  giveawayCheckIntervalMs: {
    env: "BOT_GIVEAWAY_CHECK_INTERVAL_MS",
    default: 60 * 1000,
  },
  watchMessageAlertCooldownMs: {
    env: "BOT_WATCH_MESSAGE_ALERT_COOLDOWN_MS",
    default: 30 * 60 * 1000,
  },
  newAccountThresholdMs: {
    env: "BOT_NEW_ACCOUNT_THRESHOLD_MS",
    default: 30 * 24 * 60 * 60 * 1000,
  },
  almsThreshold: { env: "BOT_ALMS_THRESHOLD", default: 50 },
  almsAmount: { env: "BOT_ALMS_AMOUNT", default: 100 },
  almsIntervalMs: { env: "BOT_ALMS_INTERVAL_MS", default: 6 * 60 * 60 * 1000 },
  maxStreakDays: { env: "BOT_MAX_STREAK_DAYS", default: 7 },
  blackjackHandTimeoutMs: {
    env: "BOT_BLACKJACK_HAND_TIMEOUT_MS",
    default: 2 * 60 * 1000,
  },
  slotsSpinFrames: { env: "BOT_SLOTS_SPIN_FRAMES", default: 3 },
  slotsFrameDelayMs: { env: "BOT_SLOTS_FRAME_DELAY_MS", default: 700 },
  dashboardRateLimitWindowMs: {
    env: "BOT_DASHBOARD_RATE_LIMIT_WINDOW_MS",
    default: 15 * 60 * 1000,
  },
  dashboardRateLimitMax: { env: "BOT_DASHBOARD_RATE_LIMIT_MAX", default: 500 },
  dashboardSessionMaxAgeMs: {
    env: "BOT_DASHBOARD_SESSION_MAX_AGE_MS",
    default: 1000 * 60 * 60 * 24 * 7,
  },
};

/** Build the config from an env object; unset or invalid values use the default. */
function loadConfig(env = process.env) {
  const config = {};
  for (const [key, { env: envName, default: fallback }] of Object.entries(
    DEFINITIONS,
  )) {
    const raw = env[envName];
    config[key] = fallback;
    if (raw === undefined || raw === "") continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      config[key] = parsed;
    } else {
      logger.warn(
        `[CONFIG] Ignoring invalid ${envName}="${raw}", using ${fallback}`,
      );
    }
  }
  return Object.freeze(config);
}

const config = loadConfig();

/**
 * Per-guild overrides, stored as nullable columns on the guild row and edited
 * on the dashboard config page. NULL means "use the global default above".
 * Units are chosen so every value fits in a 32-bit integer column.
 */
const GUILD_TUNABLES = {
  messageXpCooldownSeconds: { min: 0, max: 86400 },
  reactionXpCooldownSeconds: { min: 0, max: 86400 },
  casinoChatDripAmount: { min: 0, max: 1000000 },
  watchMessageAlertCooldownMinutes: { min: 0, max: 10080 },
  newAccountThresholdDays: { min: 0, max: 3650 },
  almsThreshold: { min: 0, max: 1000000 },
  almsAmount: { min: 0, max: 1000000 },
  almsIntervalHours: { min: 0, max: 8760 },
  maxStreakDays: { min: 0, max: 365 },
  blackjackHandTimeoutSeconds: { min: 10, max: 3600 },
  slotsSpinFrames: { min: 1, max: 10 },
  slotsFrameDelayMs: { min: 0, max: 5000 },
};

/** The guild's override for `column` (times `scale`), or `fallback` when unset. */
function guildValue(guildConfig, column, fallback, scale = 1) {
  const value = guildConfig?.[column];
  return Number.isInteger(value) ? value * scale : fallback;
}

/**
 * Validate the tunable fields of a dashboard update. Blank or null clears the
 * override (stored as NULL). Returns { updates, errors }; fields not present
 * in `data` are left out so they stay untouched.
 */
function parseTunableUpdates(data) {
  const updates = {};
  const errors = [];
  for (const [field, { min, max }] of Object.entries(GUILD_TUNABLES)) {
    const raw = data?.[field];
    if (raw === undefined) continue;
    if (raw === null || raw === "") {
      updates[field] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      errors.push(`${field} must be a whole number from ${min} to ${max}`);
    } else {
      updates[field] = value;
    }
  }
  return { updates, errors };
}

module.exports = {
  config,
  loadConfig,
  DEFINITIONS,
  GUILD_TUNABLES,
  guildValue,
  parseTunableUpdates,
};
