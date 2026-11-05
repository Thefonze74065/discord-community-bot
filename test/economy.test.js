const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const db = require("./helpers/fakeDb");
const { makeInteraction } = require("./helpers/interaction");
const economy = require("../lib/economy");

const G = "guild-1";
let nextUser = 0;
const newUser = () => `eco-user-${++nextUser}`;
const interactionFor = (userId, extra = {}) => makeInteraction({ userId, ...extra });

beforeEach(() => {
  db.reset();
  economy.gameCooldowns.clear();
  economy.openBets.clear();
});
afterEach(() => {
  db.gambleLogs.length = 0;
});

describe("formatNeedles", () => {
  test("includes emoji, bold thousands-separated amount, and currency name", () => {
    assert.equal(economy.formatNeedles(1234567), "🪡 **1,234,567** Golden Needles");
    assert.equal(economy.formatNeedles(0), "🪡 **0** Golden Needles");
  });
});

describe("getWallet", () => {
  test("creates a wallet with the server's starting balance", async () => {
    const u = newUser();
    const wallet = await economy.getWallet(u, G, { casino_starting_balance: 750 });
    assert.equal(wallet.balance, 750);
  });

  test("falls back to 500 when no config is available", async () => {
    const wallet = await economy.getWallet(newUser(), G, null);
    assert.equal(wallet.balance, 500);
  });

  test("returns the existing wallet without resetting it", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 42 });
    const wallet = await economy.getWallet(u, G, { casino_starting_balance: 750 });
    assert.equal(wallet.balance, 42);
  });
});

describe("adjustBalance", () => {
  const config = { casino_starting_balance: 100 };

  test("adds to the balance, creating the wallet first", async () => {
    const u = newUser();
    const wallet = await economy.adjustBalance(u, G, 50, config);
    assert.equal(wallet.balance, 150);
  });

  test("removes from the balance", async () => {
    const u = newUser();
    const wallet = await economy.adjustBalance(u, G, -40, config);
    assert.equal(wallet.balance, 60);
  });

  test("allows removing exactly the whole balance", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 30 });
    const wallet = await economy.adjustBalance(u, G, -30, config);
    assert.equal(wallet.balance, 0);
  });

  test("returns null and leaves the balance alone if it can't cover a removal", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 30 });
    assert.equal(await economy.adjustBalance(u, G, -31, config), null);
    assert.equal(db.getWallet(u).balance, 30);
  });

  test("adding zero is a no-op that returns the wallet", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 30 });
    assert.equal((await economy.adjustBalance(u, G, 0, config)).balance, 30);
  });
});

describe("requireCasino", () => {
  test("returns the config when the module is on", async () => {
    const i = interactionFor(newUser());
    const config = await economy.requireCasino(i);
    assert.equal(config.id, G);
    assert.equal(i.replies.length, 0);
  });

  test("replies ephemerally and returns null when the module is off", async () => {
    db.reset({ module_casino_enabled: 0 });
    const i = interactionFor(newUser());
    assert.equal(await economy.requireCasino(i), null);
    assert.deepEqual(i.replies, [
      {
        content: "Casino games are turned off in this server.",
        flags: MessageFlags.Ephemeral,
      },
    ]);
  });

  test("replies as an error when the guild has no config row", async () => {
    const i = interactionFor(newUser(), { guildId: "unknown-guild" });
    assert.equal(await economy.requireCasino(i), null);
    assert.equal(i.replies.length, 1);
  });
});

describe("replyError", () => {
  test("uses followUp once the interaction has been replied to", async () => {
    const i = interactionFor(newUser());
    i.replied = true;
    await economy.replyError(i, "boom");
    assert.deepEqual(i.replies, [{ content: "boom", flags: MessageFlags.Ephemeral }]);
    assert.equal(i.replied, true);
  });

  test("uses followUp for a deferred interaction", async () => {
    const i = interactionFor(newUser());
    i.deferred = true;
    let followed = null;
    i.followUp = async (p) => {
      followed = p;
    };
    await economy.replyError(i, "boom");
    assert.equal(followed.content, "boom");
    assert.equal(i.replies.length, 0);
  });
});

describe("startGame", () => {
  test("takes the bet and updates wager stats", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 500 });
    const config = await economy.startGame(interactionFor(u), "coinflip", 100);
    assert.equal(config.id, G);
    const w = db.getWallet(u);
    assert.equal(w.balance, 400);
    assert.equal(w.totalWagered, 100);
    assert.equal(w.gamesPlayed, 1);
  });

  test("creates a wallet with the starting balance on first play", async () => {
    const u = newUser();
    await economy.startGame(interactionFor(u), "dice", 100);
    assert.equal(db.getWallet(u).balance, 900);
  });

  test("rejects a game that is turned off", async () => {
    db.reset({ casino_games_enabled: '["dice"]' });
    const i = interactionFor(newUser());
    assert.equal(await economy.startGame(i, "slots", 10), null);
    assert.equal(i.replies[0].content, "/slots is turned off in this server.");
  });

  test("treats a null enabled-games list as all games enabled", async () => {
    db.reset({ casino_games_enabled: null });
    const config = await economy.startGame(interactionFor(newUser()), "blackjack", 10);
    assert.ok(config);
  });

  test("rejects play outside the configured gamble channel", async () => {
    db.reset({ gamble_channel_id: "casino" });
    const i = interactionFor(newUser(), { channelId: "other" });
    assert.equal(await economy.startGame(i, "dice", 10), null);
    assert.equal(i.replies[0].content, "Casino games only work in <#casino>.");
  });

  test("allows play inside the gamble channel", async () => {
    db.reset({ gamble_channel_id: "casino" });
    const i = interactionFor(newUser(), { channelId: "casino" });
    assert.ok(await economy.startGame(i, "dice", 10));
  });

  test("rejects bets below the minimum and above the maximum", async () => {
    db.reset({ casino_min_bet: 10, casino_max_bet: 100 });
    const u = newUser();
    const low = interactionFor(u);
    assert.equal(await economy.startGame(low, "dice", 9), null);
    assert.match(low.replies[0].content, /Bets must be between .*\*\*10\*\*.*and .*\*\*100\*\*/);
    const high = interactionFor(u);
    assert.equal(await economy.startGame(high, "dice", 101), null);
    assert.ok(await economy.startGame(interactionFor(u), "dice", 10));
    assert.ok(await economy.startGame(interactionFor(u), "dice", 100));
  });

  test("rejects a bet the wallet can't cover and leaves it untouched", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 50 });
    const i = interactionFor(u);
    assert.equal(await economy.startGame(i, "dice", 51), null);
    assert.match(i.replies[0].content, /You only have 🪡 \*\*50\*\* Golden Needles/);
    const w = db.getWallet(u);
    assert.equal(w.balance, 50);
    assert.equal(w.totalWagered, 0);
    assert.equal(w.gamesPlayed, 0);
  });

  test("a bet equal to the whole balance is allowed", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 50 });
    assert.ok(await economy.startGame(interactionFor(u), "dice", 50));
    assert.equal(db.getWallet(u).balance, 0);
  });

  describe("cooldown", () => {
    beforeEach(() => db.reset({ casino_cooldown_seconds: 10 }));

    test("blocks a second game until the cooldown passes", async () => {
      const u = newUser();
      assert.ok(await economy.startGame(interactionFor(u), "dice", 10));
      // Manually set cooldown to simulate time passing
      const key = `${G}:${u}`;
      economy.gameCooldowns.set(key, Date.now() - 6000); // 6 seconds ago
      const i = interactionFor(u);
      assert.equal(await economy.startGame(i, "dice", 10), null);
      assert.match(i.replies[0].content, /Slow down! You can play again/);
      assert.equal(db.getWallet(u).balance, 990);
    });

    test("allows play again after the cooldown expires", async () => {
      const u = newUser();
      db.setWallet(u, G, { balance: 500 });
      const wallet = await economy.getWallet(u, G, { casino_starting_balance: 1000 });
      assert.equal(wallet.balance, 500);
    });

    test("is tracked per user", async () => {
      await economy.startGame(interactionFor(newUser()), "dice", 10);
      assert.ok(await economy.startGame(interactionFor(newUser()), "dice", 10));
    });

    test("a rejected bet does not start a cooldown", async () => {
      const u = newUser();
      db.setWallet(u, G, { balance: 5 });
      await economy.startGame(interactionFor(u), "dice", 10);
      db.setWallet(u, G, { balance: 500 });
      assert.ok(await economy.startGame(interactionFor(u), "dice", 10));
    });
  });

  describe("daily loss cap", () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const withLoss = (u, bet, payout) => {
      db.gambleLogs.push({
        userId: u,
        guildId: G,
        game: "dice",
        bet,
        payout,
        createdAt: todayStr,
      });
    };

    afterEach(() => {
      db.gambleLogs.length = 0;
    });

    test("blocks play once net losses reach the cap", async () => {
      db.reset({ casino_daily_loss_cap: 500 });
      const u = newUser();
      withLoss(u, 800, 300);
      const i = interactionFor(u);
      assert.equal(await economy.startGame(i, "dice", 10), null);
      const resetAt = Math.floor(new Date(today.getTime() + 86400000).getTime() / 1000);
      assert.equal(
        i.replies[0].content,
        `You've hit today's loss limit of 🪡 **500** Golden Needles. Games unlock <t:${resetAt}:R>.`,
      );
    });

    test("allows play while below the cap", async () => {
      db.reset({ casino_daily_loss_cap: 500 });
      const u = newUser();
      withLoss(u, 800, 301);
      assert.ok(await economy.startGame(interactionFor(u), "dice", 10));
    });

    test("treats no games today as zero loss", async () => {
      db.reset({ casino_daily_loss_cap: 500 });
      const u = newUser();
      assert.ok(await economy.startGame(interactionFor(u), "dice", 10));
    });

    test("a cap of zero disables the check", async () => {
      db.reset({ casino_daily_loss_cap: 0 });
      const u = newUser();
      withLoss(u, 10000, 0);
      assert.ok(await economy.startGame(interactionFor(u), "dice", 10));
    });

    test("winnings offset losses", async () => {
      db.reset({ casino_daily_loss_cap: 500 });
      const u = newUser();
      withLoss(u, 2000, 1800);
      assert.ok(await economy.startGame(interactionFor(u), "dice", 10));
    });
  });
});

describe("finishGame", () => {
  test("pays out, records the log, and returns the new balance", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 900, total_wagered: 100 });
    const balance = await economy.finishGame(u, G, "coinflip", 100, 200);
    assert.equal(balance, 1100);
    assert.equal(db.getWallet(u).totalWon, 200);
    assert.deepEqual(
      { ...db.gambleLogs.at(-1), createdAt: undefined },
      { userId: u, guildId: G, game: "coinflip", bet: 100, payout: 200, createdAt: undefined },
    );
  });

  test("a zero payout still records the game", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 900 });
    assert.equal(await economy.finishGame(u, G, "dice", 100, 0), 900);
    assert.equal(db.gambleLogs.at(-1).payout, 0);
  });
});

describe("refundBet", () => {
  test("returns the bet and reverses the wager stats", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 900, total_wagered: 100, games_played: 1 });
    await economy.refundBet(u, G, 100);
    const w = db.getWallet(u);
    assert.equal(w.balance, 1000);
    assert.equal(w.totalWagered, 0);
    assert.equal(w.gamesPlayed, 0);
  });
});

describe("raiseBet", () => {
  test("takes the extra amount and counts it as wagered", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 300, total_wagered: 100 });
    assert.equal(await economy.raiseBet(u, G, 100), true);
    const w = db.getWallet(u);
    assert.equal(w.balance, 200);
    assert.equal(w.totalWagered, 200);
    assert.equal(w.gamesPlayed, 0);
  });

  test("returns false and changes nothing when the wallet can't cover it", async () => {
    const u = newUser();
    db.setWallet(u, G, { balance: 99, total_wagered: 100 });
    assert.equal(await economy.raiseBet(u, G, 100), false);
    assert.equal(db.getWallet(u).balance, 99);
  });
});

describe("open bets", () => {
  test("track, query, and clear per guild and user", () => {
    const u = newUser();
    assert.equal(economy.hasOpenBet(u, G), false);
    economy.trackOpenBet(u, G, 50);
    assert.equal(economy.hasOpenBet(u, G), true);
    assert.equal(economy.hasOpenBet(u, "guild-2"), false);
    economy.clearOpenBet(u, G);
    assert.equal(economy.hasOpenBet(u, G), false);
  });

  test("refundOpenBets refunds every tracked bet and clears them", async () => {
    const a = newUser();
    const b = newUser();
    db.setWallet(a, G, { balance: 900, total_wagered: 100, games_played: 1 });
    db.setWallet(b, G, { balance: 450, total_wagered: 50, games_played: 1 });
    economy.trackOpenBet(a, G, 100);
    economy.trackOpenBet(b, G, 50);
    await economy.refundOpenBets();
    assert.equal(db.getWallet(a).balance, 1000);
    assert.equal(db.getWallet(b).balance, 500);
    assert.equal(economy.hasOpenBet(a, G), false);
    assert.equal(economy.hasOpenBet(b, G), false);
  });

  test("one failed refund does not stop the others", async () => {
    const missing = newUser(); // no wallet, so the update throws
    const ok = newUser();
    db.setWallet(ok, G, { balance: 0, total_wagered: 10, games_played: 1 });
    economy.trackOpenBet(missing, G, 10);
    economy.trackOpenBet(ok, G, 10);
    await economy.refundOpenBets();
    assert.equal(db.getWallet(ok).balance, 10);
    assert.equal(economy.hasOpenBet(missing, G), false);
  });

  test("is a no-op with nothing open", async () => {
    await economy.refundOpenBets();
    assert.ok(true);
  });
});

describe("constants", () => {
  test("exposes the casino game list and currency", () => {
    assert.deepEqual(economy.CASINO_GAMES, ["coinflip", "dice", "slots", "blackjack"]);
    assert.equal(economy.CURRENCY_NAME, "Golden Needles");
    assert.equal(economy.CURRENCY_EMOJI, "🪡");
    assert.equal(economy.ALMS_THRESHOLD, 50);
  });
});
