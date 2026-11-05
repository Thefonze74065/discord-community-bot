(function () {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401) {
      window.location.href = "/login.html";
    }
    return response;
  };

  const { createApp } = Vue;

  createApp({
    data() {
      return {
        channels: [],
        selectedChannel: "",
        targetMessageId: "",
        sending: false,
        savedEmbeds: [],
        saveName: "",
        currentEmbedId: null, // If editing an existing saved embed
        embed: {
          author: "",
          title: "",
          description: "",
          color: "#5865F2",
          thumbnail: "",
          image: "",
          footer: "",
          timestamp: false,
          fields: [],
        },
        // Reaction Roles
        reactionRoles: [],
        guildRoles: [],
        newRr: { emoji: "", roleId: "" },
        rrLoading: false,
        // Role Menu
        roleMenu: {
          enabled: false,
          placeholder: "Select a role...",
          min: 1,
          max: 1,
          options: [],
        },
        // JSON Import/Export
        jsonString: "",
      };
    },
    watch: {
      selectedChannel(newVal) {
        if (newVal) {
          const channel = this.channels.find((c) => c.id === newVal);
          if (channel) {
            this.fetchGuildRoles(channel.guildId);
          }
        }
      },
      targetMessageId(newVal) {
        if (newVal) {
          this.fetchReactionRoles();
        } else {
          this.reactionRoles = [];
        }
      },
    },
    mounted() {
      if (window.location.protocol === "file:") {
        alert(
          "⚠️ ERROR: You opened the file directly!\n\nPlease access the dashboard at: http://localhost:3000"
        );
        return;
      }
      this.fetchChannels();

      // Check for edit param
      const urlParams = new URLSearchParams(window.location.search);
      const editId = urlParams.get("edit");
      if (editId) {
        this.loadHistoryItem(editId);
      }
    },
    methods: {
      async loadHistoryItem(messageId) {
        try {
          const res = await fetch(`/api/history/${messageId}`);
          const data = await res.json();
          if (data.error) {
            alert(data.error);
          } else {
            this.embed = data.data;
            this.targetMessageId = data.messageId;
            this.selectedChannel = data.channelId;

            if (data.roleMenu) {
              this.roleMenu = data.roleMenu;
              this.roleMenu.enabled = true;
            } else {
              this.roleMenu.enabled = false;
              this.roleMenu.options = [];
            }
            // Ensure channel is in list (might need to wait for fetchChannels)
            // But v-model should handle it if value matches
          }
        } catch (err) {
          console.error(err);
          alert("Failed to load history item.");
        }
      },
      async fetchChannels() {
        this.channels = []; // Clear existing
        try {
          console.log("Fetching channels...");
          const response = await fetch("/api/channels");
          const data = await response.json();
          if (data.error) {
            console.error(data.error);
            alert("Error loading channels: " + data.error);
          } else {
            console.log(`Loaded ${data.length} channels.`);
            this.channels = data;
            if (data.length === 0) {
              alert(
                "No text channels found where the bot has 'Send Messages' permission."
              );
            }
          }
        } catch (error) {
          console.error("Network error:", error);
          alert("Failed to connect to the bot server.");
        }
      },
      addField() {
        this.embed.fields.push({
          name: "",
          value: "",
          inline: false,
        });
      },
      removeField(index) {
        this.embed.fields.splice(index, 1);
      },
      handleImageError(e) {
        // Hide broken images in preview
        e.target.style.display = "none";
      },
      parseMarkdown(text) {
        if (!text) return "";
        // Configure marked to treat newlines as breaks (like Discord)
        // and sanitize if needed (though we trust the admin here)
        return marked.parse(text, { breaks: true });
      },
      async sendEmbed() {
        if (!this.selectedChannel) {
          alert("Please select a channel first.");
          return;
        }

        this.sending = true;

        try {
          const payload = {
            channelId: this.selectedChannel,
            embedData: this.embed,
            messageId: this.targetMessageId || null,
            roleMenu: this.roleMenu.enabled ? this.roleMenu : null,
          };

          const response = await fetch("/api/send-embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const result = await response.json();

          if (result.success) {
            if (this.targetMessageId) {
              alert("Embed updated successfully!");
            } else {
              alert("Embed sent successfully!");
              // Automatically switch to edit mode for the new message
              this.targetMessageId = result.messageId;
            }
          } else {
            alert("Failed to send/update embed: " + result.error);
          }
        } catch (error) {
          console.error("Error sending embed:", error);
          alert("An unexpected error occurred.");
        } finally {
          this.sending = false;
        }
      },
      // --- Saved Embeds Logic ---
      openSaveModal() {
        this.saveName = this.currentEmbedId
          ? this.savedEmbeds.find((e) => e.id === this.currentEmbedId)?.name ||
            ""
          : "";
        const modal = new bootstrap.Modal(document.getElementById("saveModal"));
        modal.show();
      },
      async openLoadModal() {
        await this.fetchSavedEmbeds();
        const modal = new bootstrap.Modal(document.getElementById("loadModal"));
        modal.show();
      },
      async fetchSavedEmbeds() {
        try {
          const res = await fetch("/api/embeds");
          this.savedEmbeds = await res.json();
        } catch (err) {
          console.error("Failed to fetch saved embeds", err);
          alert("Failed to load saved embeds list.");
        }
      },
      async saveEmbed() {
        if (!this.saveName) return alert("Please enter a name.");

        const payload = {
          name: this.saveName,
          data: this.embed,
        };

        try {
          let res;
          // If we are editing an existing one and the name matches, update it.
          // Or if the user wants to overwrite.
          // For simplicity, if currentEmbedId exists, we update.
          // But if the user changed the name, we might want to create new?
          // Let's just check if name exists in list to ask for overwrite?
          // For now: simple logic. If currentEmbedId is set, update. Else create.

          // Actually, let's just always create unless we explicitly want to update.
          // But the user might want to "Save As".
          // Let's try to find if an embed with this name already exists.
          const existing = this.savedEmbeds.find(
            (e) => e.name === this.saveName
          );

          if (existing) {
            if (
              !confirm(
                `An embed named "${this.saveName}" already exists. Overwrite?`
              )
            )
              return;
            res = await fetch(`/api/embeds/${existing.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          } else {
            res = await fetch("/api/embeds", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          }

          const data = await res.json();
          if (data.error) {
            alert("Error saving: " + data.error);
          } else {
            alert("Saved successfully!");
            this.currentEmbedId = data.id;
            bootstrap.Modal.getInstance(
              document.getElementById("saveModal")
            ).hide();
            this.fetchSavedEmbeds(); // Refresh list
          }
        } catch (err) {
          console.error(err);
          alert("Failed to save.");
        }
      },
      async loadEmbed(id) {
        try {
          const res = await fetch(`/api/embeds/${id}`);
          const data = await res.json();
          if (data.error) {
            alert(data.error);
          } else {
            this.embed = data.data;
            this.currentEmbedId = data.id;
            this.saveName = data.name;
            bootstrap.Modal.getInstance(
              document.getElementById("loadModal")
            ).hide();
          }
        } catch (err) {
          console.error(err);
          alert("Failed to load embed.");
        }
      },
      // --- Reaction Roles Methods ---
      async fetchGuildRoles(guildId) {
        try {
          const res = await fetch(`/api/guilds/${guildId}/roles`);
          const data = await res.json();
          if (data.error) {
            console.error(data.error);
          } else {
            this.guildRoles = data;
          }
        } catch (err) {
          console.error("Failed to fetch roles:", err);
        }
      },
      async fetchReactionRoles() {
        if (!this.targetMessageId) return;
        try {
          const res = await fetch(
            `/api/reaction-roles/${this.targetMessageId}`
          );
          const data = await res.json();
          if (data.error) {
            console.error(data.error);
          } else {
            this.reactionRoles = data;
          }
        } catch (err) {
          console.error("Failed to fetch reaction roles:", err);
        }
      },
      getRoleName(roleId) {
        const role = this.guildRoles.find((r) => r.id === roleId);
        return role ? role.name : roleId;
      },
      async addReactionRole() {
        if (!this.newRr.emoji || !this.newRr.roleId) return;

        this.rrLoading = true;
        const channel = this.channels.find(
          (c) => c.id === this.selectedChannel
        );

        try {
          const payload = {
            guildId: channel.guildId,
            channelId: this.selectedChannel,
            messageId: this.targetMessageId,
            emoji: this.newRr.emoji,
            roleId: this.newRr.roleId,
          };

          const res = await fetch("/api/reaction-roles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const data = await res.json();
          if (data.error) {
            alert(data.error);
          } else {
            this.newRr.emoji = "";
            this.newRr.roleId = "";
            this.fetchReactionRoles();
          }
        } catch (err) {
          console.error(err);
          alert("Failed to add reaction role.");
        } finally {
          this.rrLoading = false;
        }
      },
      async removeReactionRole(rr) {
        if (!confirm(`Remove reaction role for ${rr.emoji}?`)) return;

        try {
          const res = await fetch("/api/reaction-roles", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messageId: rr.messageId,
              emoji: rr.emoji,
              channelId: this.selectedChannel,
            }),
          });

          const data = await res.json();
          if (data.error) {
            alert(data.error);
          } else {
            this.fetchReactionRoles();
          }
        } catch (err) {
          console.error(err);
          alert("Failed to remove reaction role.");
        }
      },
      // --- Role Menu Methods ---
      addMenuOption() {
        this.roleMenu.options.push({
          label: "",
          description: "",
          emoji: "",
          roleId: "",
        });
      },
      removeMenuOption(index) {
        this.roleMenu.options.splice(index, 1);
      },
      async deleteEmbed(id) {
        if (!confirm("Are you sure you want to delete this embed?")) return;
        try {
          await fetch(`/api/embeds/${id}`, { method: "DELETE" });
          this.fetchSavedEmbeds(); // Refresh list
          if (this.currentEmbedId === id) {
            this.currentEmbedId = null;
            this.saveName = "";
          }
        } catch (err) {
          console.error(err);
          alert("Failed to delete.");
        }
      },
      // --- JSON Import/Export ---
      openExportJSONModal() {
        this.jsonString = JSON.stringify(this.embed, null, 2);
        const modal = new bootstrap.Modal(
          document.getElementById("exportJsonModal")
        );
        modal.show();
      },
      openImportJSONModal() {
        this.jsonString = "";
        const modal = new bootstrap.Modal(
          document.getElementById("importJsonModal")
        );
        modal.show();
      },
      copyToClipboard() {
        navigator.clipboard
          .writeText(this.jsonString)
          .then(() => {
            alert("Copied to clipboard!");
          })
          .catch((err) => {
            console.error("Failed to copy: ", err);
          });
      },
      applyJsonImport() {
        try {
          const data = JSON.parse(this.jsonString);
          // Basic validation
          if (typeof data !== "object" || !data)
            throw new Error("Invalid JSON");

          // Update embed
          this.embed = {
            author: data.author || "",
            title: data.title || "",
            description: data.description || "",
            color: data.color || "#5865F2",
            thumbnail: data.thumbnail || "",
            image: data.image || "",
            footer: data.footer || "",
            timestamp: !!data.timestamp,
            fields: Array.isArray(data.fields) ? data.fields : [],
          };

          bootstrap.Modal.getInstance(
            document.getElementById("importJsonModal")
          ).hide();
          alert("Imported successfully!");
        } catch (err) {
          alert("Invalid JSON format: " + err.message);
        }
      },
    },
  }).mount("#app");
})();
