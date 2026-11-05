const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../lib/database");
const {
  createTicket, closeTicket, requestClose, addUserToTicket, sendTranscript, deleteTicket,
} = require("../lib/modmailCommands");
const { memberChoices } = require("../lib/modmailHelpers");
const logger = require("../lib/logger");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("modmail")
    .setDescription("Manage modmail tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a modmail ticket for a user")
        .addUserOption((option) =>
          option.setName("user").setDescription("The user to create a ticket for").setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("admin_only")
            .setDescription("Only allow admins (not moderators) to view this ticket")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("close").setDescription("Close the current modmail ticket (removes user access)"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("request-close").setDescription("Ask the user if the ticket can be closed"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a user to the current ticket")
        .addStringOption((option) =>
          option.setName("user").setDescription("The user to add").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("transcript").setDescription("Generate and send the transcript for this modmail ticket"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("delete").setDescription("Delete the current modmail ticket channel"),
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: subcommand === "create" || subcommand === "add" });
    const guild = interaction.guild;

    const guildConfig = getGuildStmt.get(guild.id);
    if (!guildConfig || !guildConfig.modmail_category_id) {
      return interaction.editReply({
        content: "Modmail is not configured for this server. Please set a Modmail Category in the dashboard.",
      });
    }

    if (subcommand === "create" && guildConfig.module_modmail_enabled === false) {
      return interaction.editReply({ content: "Modmail is disabled for this server." });
    }

    switch (subcommand) {
      case "create": return createTicket(interaction, guildConfig);
      case "close": return closeTicket(interaction, guildConfig);
      case "request-close": return requestClose(interaction);
      case "add": return addUserToTicket(interaction);
      case "transcript": return sendTranscript(interaction);
      case "delete": return deleteTicket(interaction);
    }
  },
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === "user") {
      try {
        const filtered = memberChoices(interaction.guild.members.cache, focusedOption.value);
        await interaction.respond(filtered);
      } catch (error) {
        logger.error("Autocomplete error:", error);
        await interaction.respond([]);
      }
    }
  },
};
