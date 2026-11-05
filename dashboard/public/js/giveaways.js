(function () {
  const { createApp } = Vue;

  createApp({
    data() {
      return {
        giveaways: [],
        channels: [],
        newGiveaway: {
          prize: "",
          sponsors: "",
          endTime: "",
          winnerCount: 1,
          channelId: "",
          description: "",
        },
        creating: false,
        editGiveaway: {
          id: null,
          prize: "",
          sponsors: "",
          endTime: "",
          winnerCount: 1,
          channelId: "",
          description: "",
        },
        editingGiveaway: false,
      };
    },
    async mounted() {
      await this.fetchChannels();
      await this.fetchGiveaways();
    },
    methods: {
      async fetchChannels() {
        this.channels = [];
        try {
          const response = await fetch("/api/channels");
          const data = await response.json();
          if (data.error) {
            console.error(data.error);
            alert("Error loading channels: " + data.error);
          } else {
            this.channels = data;
            if (data.length === 0) {
              alert(
                "No text channels found where the bot has 'Send Messages' permission.",
              );
            }
          }
        } catch (error) {
          console.error("Network error:", error);
          alert("Failed to connect to the bot server.");
        }
      },

      async deleteGiveaway(id) {
        if (
          !confirm(
            "Are you sure you want to delete this giveaway? This cannot be undone.",
          )
        )
          return;
        const res = await fetch(`/api/giveaways/${id}`, { method: "DELETE" });
        if (res.ok) {
          await this.fetchGiveaways();
        } else {
          alert("Failed to delete giveaway.");
        }
      },
      async fetchGiveaways() {
        const res = await fetch("/api/giveaways");
        this.giveaways = await res.json();
      },
      async createGiveaway() {
        this.creating = true;
        try {
          const payload = {
            ...this.newGiveaway,
            sponsors: this.newGiveaway.sponsors.split(",").map((s) => s.trim()),
          };
          const res = await fetch("/api/giveaways", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            await this.fetchGiveaways();
            this.newGiveaway = {
              prize: "",
              sponsors: "",
              endTime: "",
              winnerCount: 1,
              channelId: "",
              description: "",
            };
          } else {
            alert("Failed to create giveaway.");
          }
        } finally {
          this.creating = false;
        }
      },
      async endGiveaway(id) {
        if (!confirm("End this giveaway now?")) return;
        const res = await fetch(`/api/giveaways/${id}/end`, { method: "POST" });
        if (res.ok) {
          await this.fetchGiveaways();
        } else {
          alert("Failed to end giveaway.");
        }
      },
      async rerollGiveaway(id, rerollAll) {
        const confirmMsg = rerollAll
          ? "Reroll ALL winners? This will select completely new winners."
          : "Reroll invalid winners? This will only replace winners who left the server.";
        if (!confirm(confirmMsg)) return;

        try {
          const res = await fetch(`/api/giveaways/${id}/reroll`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rerollAll }),
          });

          if (res.ok) {
            const data = await res.json();
            alert(`Reroll successful! New winners: ${data.winners.length}`);
            await this.fetchGiveaways();
          } else {
            const error = await res.json();
            alert(`Failed to reroll: ${error.error || "Unknown error"}`);
          }
        } catch (error) {
          console.error("Error rerolling giveaway:", error);
          alert("Failed to reroll giveaway.");
        }
      },
      formatDate(dt) {
        if (!dt) return "";
        const d = new Date(dt);
        return d.toLocaleString("en-US", { timeZone: "UTC", hour12: false });
      },

      openEditGiveaway(g) {
        // Copy giveaway data to editGiveaway
        this.editGiveaway = {
          id: g.id,
          prize: g.prize,
          sponsors: Array.isArray(g.sponsors)
            ? g.sponsors.join(", ")
            : g.sponsors,
          endTime: g.endTime
            ? new Date(g.endTime).toISOString().slice(0, 16)
            : "",
          winnerCount: g.winnerCount,
          channelId: g.channelId,
          description: g.description || "",
        };
        const modal = new bootstrap.Modal(
          document.getElementById("editGiveawayModal"),
        );
        modal.show();
      },

      async submitEditGiveaway() {
        this.editingGiveaway = true;
        try {
          const payload = {
            prize: this.editGiveaway.prize,
            sponsors: this.editGiveaway.sponsors
              .split(",")
              .map((s) => s.trim()),
            endTime: this.editGiveaway.endTime,
            winnerCount: this.editGiveaway.winnerCount,
            channelId: this.editGiveaway.channelId,
            description: this.editGiveaway.description,
          };
          const res = await fetch(`/api/giveaways/${this.editGiveaway.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            await this.fetchGiveaways();
            // Hide modal
            const modal = bootstrap.Modal.getInstance(
              document.getElementById("editGiveawayModal"),
            );
            if (modal) modal.hide();
          } else {
            alert("Failed to update giveaway.");
          }
        } finally {
          this.editingGiveaway = false;
        }
      },
    },
  }).mount("#app");
})();
