const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("node:path");

test("schema loads without errors", () => {
  const schemaPath = path.join(__dirname, "..", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

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
    assert.ok(
      schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
      `Missing table: ${table}`,
    );
  }
});
