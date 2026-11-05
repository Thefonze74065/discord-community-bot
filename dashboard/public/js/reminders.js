const { createApp } = Vue;
const { ChannelSelect, RoleSelect } = window.DashboardComponents;

createApp({
  components: {
    ChannelSelect,
    RoleSelect,
  },
  data() {
    return {
      loading: true,
      reminders: [],
      guilds: [],
      selectedGuildId: "",
      showCreateModal: false,
      showEditModal: false,
      newReminder: {
        guildId: "",
        channelId: "",
        roleId: "",
        name: "",
        cron: "",
        message: "",
      },
      editingReminder: null,
      channels: [],
      roles: [],
      channelCache: {}, // Cache for channel names
      roleCache: {}, // Cache for role names
    };
  },
  async mounted() {
    try {
      await this.fetchGuilds();
      await this.fetchReminders();
    } finally {
      this.loading = false;
    }
  },
  methods: {
    async fetchGuilds() {
      try {
        const res = await fetch("/api/admin-guilds");
        if (!res.ok) {
          if (res.status === 401) window.location.href = "/login.html";
          return;
        }
        this.guilds = await res.json();
        if (this.guilds.length > 0) {
          this.selectedGuildId = this.guilds[0].id;
        }
      } catch (e) {
        console.error(e);
      }
    },
    async fetchReminders() {
      try {
        const res = await fetch("/api/reminders");
        if (!res.ok) {
          if (res.status === 401) window.location.href = "/login.html";
          return;
        }
        this.reminders = await res.json();

        // Fetch channel and role names for all reminders
        await this.fetchChannelNames();
        await this.fetchRoleNames();
      } catch (e) {
        console.error(e);
      }
    },
    async fetchChannelNames() {
      try {
        const res = await fetch("/api/channels");
        if (res.ok) {
          const channels = await res.json();
          // Build cache
          this.channelCache = {};
          channels.forEach((ch) => {
            this.channelCache[ch.id] = `#${ch.name}`;
          });
        }
      } catch (e) {
        console.error(e);
      }
    },
    async fetchRoleNames() {
      // Fetch roles for all guilds that have reminders
      const guildIds = [
        ...new Set(this.reminders.map((r) => r.guildId).filter(Boolean)),
      ];

      for (const guildId of guildIds) {
        try {
          const res = await fetch(`/api/guilds/${guildId}/roles`);
          if (res.ok) {
            const roles = await res.json();
            roles.forEach((role) => {
              this.roleCache[role.id] = `@${role.name}`;
            });
          }
        } catch (e) {
          console.error(e);
        }
      }
    },
    getChannelName(channelId) {
      if (!channelId) return "Default (Reminder Channel)";
      return this.channelCache[channelId] || "Unknown Channel";
    },
    getRoleName(roleId) {
      if (!roleId) return "None";
      return this.roleCache[roleId] || `Role ${roleId}`;
    },
    openCreateModal() {
      this.newReminder = {
        guildId: this.selectedGuildId || "",
        channelId: "",
        roleId: "",
        name: "",
        cron: "",
        message: "",
      };
      this.showCreateModal = true;
    },
    closeCreateModal() {
      this.showCreateModal = false;
    },
    async createReminder() {
      try {
        const res = await fetch("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.newReminder),
        });
        if (res.ok) {
          await this.fetchReminders();
          this.closeCreateModal();
        } else {
          alert("Failed to create reminder");
        }
      } catch (e) {
        console.error(e);
        alert("Error creating reminder");
      }
    },
    openEditModal(reminder) {
      this.editingReminder = { ...reminder };
      this.showEditModal = true;
    },
    closeEditModal() {
      this.showEditModal = false;
      this.editingReminder = null;
    },
    async updateReminder() {
      try {
        const res = await fetch(`/api/reminders/${this.editingReminder.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.editingReminder),
        });
        if (res.ok) {
          await this.fetchReminders();
          this.closeEditModal();
        } else {
          alert("Failed to update reminder");
        }
      } catch (e) {
        console.error(e);
        alert("Error updating reminder");
      }
    },
    async deleteReminder(id) {
      if (!confirm("Are you sure you want to delete this reminder?")) return;
      try {
        const res = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
        if (res.ok) {
          await this.fetchReminders();
        } else {
          alert("Failed to delete reminder");
        }
      } catch (e) {
        console.error(e);
        alert("Error deleting reminder");
      }
    },
  },
}).mount("#app");
