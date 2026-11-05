const { test } = require("node:test");
const assert = require("node:assert");
const db = require("../lib/database");

test("schema loads without errors", () => {
  // Verify key tables exist
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((t) => t.name);

  for (const table of [
    "guilds",
    "wallets",
    "user_levels",
    "modmail_tickets",
    "giveaways",
    "warnings",
    "user_notes",
    "birthdays",
    "global_reminders",
    "todo_items",
    "watched_users",
    "tts_logs",
    "vc_transcripts",
    "temp_voice_channels",
    "voice_sessions",
    "reaction_roles",
    "role_menus",
    "role_menu_options",
    "saved_embeds",
    "dashboard_messages",
    "user_game_accounts",
    "moderator_actions",
  ]) {
    assert.ok(tables.includes(table), `Missing table: ${table}`);
  }
});
