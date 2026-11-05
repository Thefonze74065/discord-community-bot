const db = require("../../lib/database");
const { handleRouteError } = require("../errors");

function registerEmbedsRoutes(app, { checkAuth }) {
  app.get("/api/embeds", checkAuth, async (req, res) => {
    try {
      const embeds = db
        .prepare(
          "SELECT id, name, updated_at FROM saved_embeds ORDER BY updated_at DESC",
        )
        .all();
      res.json(embeds);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching saved embeds:",
        error,
        "Failed to fetch saved embeds",
      );
    }
  });

  app.get("/api/embeds/:id", checkAuth, async (req, res) => {
    try {
      const embed = db
        .prepare("SELECT * FROM saved_embeds WHERE id = ?")
        .get(req.params.id);
      if (!embed) return res.status(404).json({ error: "Embed not found" });
      res.json(embed);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching saved embed:",
        error,
        "Failed to fetch saved embed",
      );
    }
  });

  app.post("/api/embeds", checkAuth, async (req, res) => {
    const { name, data } = req.body;
    if (!name || !data) {
      return res.status(400).json({ error: "Missing name or data" });
    }
    try {
      const result = db
        .prepare(
          "INSERT INTO saved_embeds (name, data, created_at, updated_at) VALUES (@name, @data, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
        .run({ name, data: JSON.stringify(data) });
      const newEmbed = { id: result.lastInsertRowid, name, data };
      res.json(newEmbed);
    } catch (error) {
      handleRouteError(
        res,
        "Error creating saved embed:",
        error,
        "Failed to create saved embed",
      );
    }
  });

  app.put("/api/embeds/:id", checkAuth, async (req, res) => {
    const { name, data } = req.body;
    try {
      db.prepare(
        "UPDATE saved_embeds SET name = @name, data = @data, updated_at = CURRENT_TIMESTAMP WHERE id = @id",
      ).run({ id: req.params.id, name, data: JSON.stringify(data) });
      const updatedEmbed = { id: req.params.id, name, data };
      res.json(updatedEmbed);
    } catch (error) {
      handleRouteError(
        res,
        "Error updating saved embed:",
        error,
        "Failed to update saved embed",
      );
    }
  });

  app.delete("/api/embeds/:id", checkAuth, async (req, res) => {
    try {
      db.prepare("DELETE FROM saved_embeds WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      handleRouteError(
        res,
        "Error deleting saved embed:",
        error,
        "Failed to delete saved embed",
      );
    }
  });
}

module.exports = registerEmbedsRoutes;
