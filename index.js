require("dotenv").config();

const logger = require("./lib/logger");
const { validateEnvironment } = require("./lib/env-validator");
validateEnvironment();

const packageJson = require("./package.json");
logger.info(`[INFO] Starting Discord Community Bot v${packageJson.version}...`);
logger.info(`[INFO] Build Timestamp: ${new Date().toISOString()}`);
const {
  Client, GatewayIntentBits, Collection, Partials, MessageFlags,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const db = require("./lib/database");
const { flushAllXp } = require("./lib/leveling");
const { refundOpenBets } = require("./lib/economy");
const { logCommandUsage } = require("./lib/logging");
const {
  handleUncaughtException, handleUnhandledRejection,
} = require("./lib/processHandlers");
const { startDashboard } = require("./dashboard/server");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
    const command = require(path.join(commandsPath, file));
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
      logger.info(`[INFO] Loaded command: ${command.data.name}`);
    } else {
      logger.info(`[WARNING] The command at ${file} is missing a required "data" or "execute" property.`);
    }
  }
}

const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
  for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"))) {
    const event = require(path.join(eventsPath, file));
    if ("name" in event && "execute" in event) {
      client.on(event.name, (...args) => event.execute(...args));
      logger.info(`[INFO] Loaded event: ${event.name}`);
    } else {
      logger.info(`[WARNING] The event at ${file} is missing a required "name" or "execute" property.`);
    }
  }
}

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;
    try { await command.autocomplete(interaction); } catch (error) {
      logger.error(`[ERROR] Error executing autocomplete for ${interaction.commandName}:`, error);
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
      const userCommands = ["level", "leaderboard", "setcolor", "balance", "daily", "needles", "coinflip", "dice", "slots", "blackjack", "pot"];
      const logType = userCommands.includes(interaction.commandName) ? "message" : "moderation";
      await logCommandUsage(interaction, logType);
    } catch (error) {
      logger.error(`[ERROR] Error executing ${interaction.commandName}:`, error);
      const errorMessage = { content: "There was an error while executing this command!", flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(errorMessage);
      else await interaction.reply(errorMessage);
    }
    return;
  }
});

require("./events/giveawayScheduler")(client);

client.on("error", (error) => logger.error("[ERROR] Discord client error:", error));
process.on("uncaughtException", (error) => handleUncaughtException(error));
process.on("unhandledRejection", (reason) => handleUnhandledRejection(reason));

const { sendTTSShutdownWarnings } = require("./lib/tts");
process.on("SIGINT", async () => {
  logger.info("\n[INFO] Shutting down gracefully...");
  if (client && client.isReady()) await sendTTSShutdownWarnings(client);
  await flushAllXp();
  await refundOpenBets();
  db.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("\n[INFO] Shutting down gracefully...");
  if (client && client.isReady()) await sendTTSShutdownWarnings(client);
  await flushAllXp();
  await refundOpenBets();
  db.close();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).then(() => {
  global._dashboardClient = client;
  startDashboard(client);
});
