const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  loadConfig,
  DEFINITIONS,
  GUILD_TUNABLES,
  guildValue,
  parseTunableUpdates,
} = require("../lib/config");

test("defaults match the previously hardcoded values", () => {
  const config = loadConfig({});
  assert.equal(config.messageXpCooldownSeconds, 30);
  assert.equal(config.reactionXpCooldownSeconds, 30);
  assert.equal(config.casinoChatDripAmount, 1);
  assert.equal(config.xpSaveIntervalMinutes, 10);
  assert.equal(config.giveawayCheckIntervalMs, 60000);
  assert.equal(config.watchMessageAlertCooldownMs, 1800000);
  assert.equal(config.newAccountThresholdMs, 2592000000);
  assert.equal(config.almsThreshold, 50);
  assert.equal(config.almsAmount, 100);
  assert.equal(config.almsIntervalMs, 21600000);
  assert.equal(config.maxStreakDays, 7);
  assert.equal(config.blackjackHandTimeoutMs, 120000);
  assert.equal(config.slotsSpinFrames, 3);
  assert.equal(config.slotsFrameDelayMs, 700);
  assert.equal(config.dashboardRateLimitWindowMs, 900000);
  assert.equal(config.dashboardRateLimitMax, 500);
  assert.equal(config.dashboardSessionMaxAgeMs, 604800000);
});

test("covers every definition", () => {
  assert.deepEqual(
    Object.keys(loadConfig({})).sort(),
    Object.keys(DEFINITIONS).sort(),
  );
});

test("environment variables override defaults", () => {
  const config = loadConfig({
    BOT_ALMS_AMOUNT: "250",
    BOT_MESSAGE_XP_COOLDOWN_SECONDS: "0",
  });
  assert.equal(config.almsAmount, 250);
  assert.equal(config.messageXpCooldownSeconds, 0);
  assert.equal(config.almsThreshold, 50);
});

test("invalid or empty values fall back to the default", () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);
  try {
    const config = loadConfig({
      BOT_ALMS_AMOUNT: "abc",
      BOT_MAX_STREAK_DAYS: "-3",
      BOT_ALMS_THRESHOLD: "",
    });
    assert.equal(config.almsAmount, 100);
    assert.equal(config.maxStreakDays, 7);
    assert.equal(config.almsThreshold, 50);
    assert.equal(warnings.length, 2);
  } finally {
    console.warn = warn;
  }
});

test("config is frozen", () => {
  assert.throws(() => {
    "use strict";
    loadConfig({}).almsAmount = 1;
  }, TypeError);
});

test("guildValue uses the guild override, else the fallback", () => {
  assert.equal(guildValue({ almsAmount: 40 }, "almsAmount", 100), 40);
  assert.equal(guildValue({ almsAmount: 0 }, "almsAmount", 100), 0);
  assert.equal(guildValue({ almsAmount: null }, "almsAmount", 100), 100);
  assert.equal(guildValue({}, "almsAmount", 100), 100);
  assert.equal(guildValue(null, "almsAmount", 100), 100);
  assert.equal(
    guildValue({ almsIntervalHours: 2 }, "almsIntervalHours", 1, 3600000),
    7200000,
  );
});

test("parseTunableUpdates accepts valid values and clears blanks", () => {
  const { updates, errors } = parseTunableUpdates({
    almsAmount: "250",
    maxStreakDays: "",
    slotsSpinFrames: null,
    casinoMinBet: 5,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(updates, {
    almsAmount: 250,
    maxStreakDays: null,
    slotsSpinFrames: null,
  });
});

test("parseTunableUpdates leaves absent fields out", () => {
  assert.deepEqual(parseTunableUpdates({}), { updates: {}, errors: [] });
});

test("parseTunableUpdates rejects out-of-range and non-integer values", () => {
  const { updates, errors } = parseTunableUpdates({
    almsAmount: -1,
    slotsSpinFrames: 0,
    maxStreakDays: 1.5,
    blackjackHandTimeoutSeconds: "abc",
  });
  assert.deepEqual(updates, {});
  assert.equal(errors.length, 4);
});

test("guild tunable columns exist in schema.sql", () => {
  const root = path.join(__dirname, "..");
  const schema = fs.readFileSync(path.join(root, "schema.sql"), "utf8");
  for (const column of Object.keys(GUILD_TUNABLES)) {
    const snakeColumn = column.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
    assert.match(
      schema,
      new RegExp(`\\b${snakeColumn}\\s+INTEGER`),
      `Missing column ${column} in schema.sql`,
    );
  }
});
