(function() {
    const { createApp } = Vue;
    createApp({
        data() {
            return {
                history: [],
                loading: false,
                error: null,
                channels: [],
                importChannelId: "",
                importMessageId: "",
                importing: false
            }
        },
        mounted() {
            this.fetchHistory();
            this.fetchChannels();
        },
        methods: {
            async fetchChannels() {
                try {
                    const res = await fetch('/api/channels');
                    if (res.status === 401) return window.location.href = "/login.html";
                    this.channels = await res.json();
                } catch (err) {
                    console.error(err);
                }
            },
            async fetchHistory() {
                this.loading = true;
                this.error = null;
                try {
                    const res = await fetch('/api/history');
                    if (res.status === 401) return window.location.href = "/login.html";
                    if (res.ok) {
                        this.history = await res.json();
                    } else {
                        const data = await res.json();
                        this.error = "Failed to load history: " + (data.error || res.statusText);
                    }
                } catch (err) {
                    console.error(err);
                    this.error = "Network error loading history.";
                } finally {
                    this.loading = false;
                }
            },
            openImportModal() {
                const modal = new bootstrap.Modal(document.getElementById('importModal'));
                modal.show();
            },
            async importMessage() {
                if (!this.importChannelId || !this.importMessageId) {
                    alert("Please fill in all fields.");
                    return;
                }

                this.importing = true;
                try {
                    const res = await fetch('/api/import-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            channelId: this.importChannelId,
                            messageId: this.importMessageId
                        })
                    });

                    if (res.status === 401) return window.location.href = "/login.html";

                    const data = await res.json();
                    if (data.error) {
                        alert(data.error);
                    } else {
                        alert("Message imported successfully!");
                        bootstrap.Modal.getInstance(document.getElementById('importModal')).hide();
                        this.fetchHistory();
                        this.importMessageId = "";
                    }
                } catch (err) {
                    console.error(err);
                    alert("Failed to import message.");
                } finally {
                    this.importing = false;
                }
            }
        }
    }).mount('#app');
})();
