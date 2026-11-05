const { Events } = require("discord.js");
const db = require("../lib/database");
const logger = require("../lib/logger");

const getGiveawayByMessageStmt = db.prepare(
  "SELECT * FROM giveaways WHERE message_id = ? AND ended = 0",
);
const deleteGiveawayEntryStmt = db.prepare(
  "DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?",
);
const getReactionRoleStmt = db.prepare(
  "SELECT * FROM reaction_roles WHERE message_id = ? AND emoji = ?",
);

module.exports = {
  name: Events.MessageReactionRemove,
  async execute(reaction, user) {
    if (user.bot || !reaction.message.guild) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        logger.error("Something went wrong when fetching the message:", error);
        return;
      }
    }

    try {
      const giveaway = getGiveawayByMessageStmt.get(reaction.message.id);
      if (giveaway && reaction.emoji.name === "🎉") {
        deleteGiveawayEntryStmt.run(giveaway.id, user.id);
        return;
      }
    } catch (error) {
      logger.error("Error handling giveaway entry removal:", error);
    }

    try {
      const emojiKey = reaction.emoji.id || reaction.emoji.name;

      const reactionRole = getReactionRoleStmt.get(
        reaction.message.id,
        emojiKey,
      );

      if (reactionRole) {
        const member = await reaction.message.guild.members.fetch(user.id);
        await member.roles.remove(reactionRole.role_id);
      }
    } catch (error) {
      logger.error("Error handling reaction role remove:", error);
    }
  },
};
