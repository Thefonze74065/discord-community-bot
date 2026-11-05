require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const db = require("./lib/database");
const logger = require("./lib/logger");

const commands = [];
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
    logger.info(`[INFO] Loaded command: ${command.data.name}`);
  } else {
    logger.info(`[WARNING] The command at ${file} is missing a required "data" or "execute" property.`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;

if (!clientId) {
  logger.error("[ERROR] Missing DISCORD_CLIENT_ID or CLIENT_ID in environment variables.");
  process.exit(1);
}

(async () => {
  let exitCode = 0;
  try {
    logger.info(`[INFO] Started refreshing ${commands.length} application (/) commands.`);
    const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.info(`[SUCCESS] Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    logger.error("[ERROR] Error deploying commands:", error);
    exitCode = 1;
  } finally {
    db.close();
    process.exitCode = exitCode;
  }
})();
