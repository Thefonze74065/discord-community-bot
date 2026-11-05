const express = require("express");
const path = require("path");
const db = require("../../lib/database");
const logger = require("../../lib/logger");

const getVCTranscriptStmt = db.prepare(
  "SELECT guild_id FROM vc_transcripts WHERE id = ?",
);
const getModmailTicketStmt = db.prepare(
  "SELECT guild_id FROM modmail_tickets WHERE id = ?",
);

function registerPagesRoutes(
  app,
  { checkAuth, hasGuildAccess, hasGuildAdmin },
) {
  app.use((req, res, next) => {
    const protectedPaths = [
      "/",
      "/index.html",
      "/builder.html",
      "/config.html",
      "/transcripts.html",
    ];
    if (protectedPaths.includes(req.path)) {
      return checkAuth(req, res, next);
    }
    next();
  });

  app.get("/transcripts/:filename", checkAuth, async (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(__dirname, "..", "public/transcripts", filename);

    const fs = require("fs");
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Transcript not found");
    }

    try {
      const isVCTranscript = filename.startsWith("vc-");
      const isModmailTranscript = filename.startsWith("ticket-");

      if (!isVCTranscript && !isModmailTranscript) {
        return res.status(403).send("Access denied");
      }

      let transcriptId;
      if (isVCTranscript) {
        transcriptId = filename.replace("vc-", "").replace(".html", "");
      } else {
        transcriptId = filename.replace("ticket-", "").replace(".html", "");
      }

      let guildId;
      if (isVCTranscript) {
        const transcript = getVCTranscriptStmt.get(transcriptId);
        if (!transcript) {
          return res.status(404).send("Transcript not found in database");
        }
        guildId = transcript.guild_id;

        const isAdmin = await hasGuildAdmin(req.user.id, guildId);
        if (!isAdmin) {
          return res.status(403).send("Access denied: Admin only");
        }
      } else {
        const transcript = getModmailTicketStmt.get(transcriptId);
        if (!transcript) {
          return res.status(404).send("Transcript not found in database");
        }
        guildId = transcript.guild_id;

        const hasAccess = await hasGuildAccess(req.user.id, guildId);
        if (!hasAccess) {
          return res.status(403).send("Access denied");
        }
      }

      res.sendFile(filePath);
    } catch (error) {
      logger.error("Error serving transcript:", error);
      res.status(500).send("Error loading transcript");
    }
  });

  app.use(express.static(path.join(__dirname, "..", "public")));
}

module.exports = registerPagesRoutes;
