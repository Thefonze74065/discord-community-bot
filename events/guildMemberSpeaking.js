const { updateVoiceActivity } = require("./voiceStateUpdate");

module.exports = {
  name: "guildMemberSpeaking",
  execute(member, speaking) {
    // speaking is a ReadOnlyBitField
    // If the bitfield is > 0, it means they are speaking (or soundsharing, etc.)
    if (speaking.bitfield > 0 && !member.user.bot) {
      updateVoiceActivity(member.id);
    }
  },
};
