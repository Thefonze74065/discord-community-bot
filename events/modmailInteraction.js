const { Events } = require("discord.js");
const {
  createTicket,
  cancelClose,
  closeTicket,
  reopenTicket,
  generateTranscript,
  deleteTicket,
} = require("../lib/modmailInteractions");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    const { customId } = interaction;

    if (customId === "modmail_create") {
      await createTicket(interaction);
    } else if (customId === "modmail_close_cancel") {
      await cancelClose(interaction);
    } else if (
      customId === "modmail_close" ||
      customId === "modmail_close_confirm"
    ) {
      await closeTicket(interaction);
    } else if (customId === "modmail_reopen") {
      await reopenTicket(interaction);
    } else if (customId === "modmail_transcript") {
      await generateTranscript(interaction);
    } else if (customId === "modmail_delete") {
      await deleteTicket(interaction);
    }
  },
};
