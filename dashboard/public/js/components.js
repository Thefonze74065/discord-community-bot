// Shared Vue Components for Dashboard
(function () {
  "use strict";

  // Channel Selector Component
  const ChannelSelect = {
    template: `
      <select class="form-select" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
        <option value="">{{ placeholder }}</option>
        <option v-for="channel in channels" :key="channel.id" :value="channel.id">
          #{{ channel.name }} ({{ channel.guild }})
        </option>
      </select>
    `,
    props: {
      modelValue: String,
      placeholder: {
        type: String,
        default: "Select a channel",
      },
    },
    emits: ["update:modelValue"],
    data() {
      return {
        channels: [],
      };
    },
    async mounted() {
      await this.fetchChannels();
    },
    methods: {
      async fetchChannels() {
        try {
          const res = await fetch("/api/channels");
          if (res.ok) {
            this.channels = await res.json();
          }
        } catch (e) {
          console.error("Failed to load channels", e);
        }
      },
    },
  };

  // Role Selector Component
  const RoleSelect = {
    template: `
      <select class="form-select" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
        <option value="">{{ placeholder }}</option>
        <option v-for="role in roles" :key="role.id" :value="role.id">
          @{{ role.name }}
        </option>
      </select>
    `,
    props: {
      modelValue: String,
      guildId: String,
      placeholder: {
        type: String,
        default: "Select a role",
      },
    },
    emits: ["update:modelValue"],
    data() {
      return {
        roles: [],
      };
    },
    watch: {
      guildId: {
        immediate: true,
        handler(newGuildId) {
          if (newGuildId) {
            this.fetchRoles();
          } else {
            this.roles = [];
          }
        },
      },
    },
    methods: {
      async fetchRoles() {
        if (!this.guildId) return;
        try {
          const res = await fetch(`/api/guilds/${this.guildId}/roles`);
          if (res.ok) {
            this.roles = await res.json();
          }
        } catch (e) {
          console.error("Failed to load roles", e);
        }
      },
    },
  };

  // Export components to global scope
  window.DashboardComponents = {
    ChannelSelect,
    RoleSelect,
  };

  console.log("DashboardComponents loaded successfully");
})();
