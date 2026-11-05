(function () {
  const { createApp } = Vue;

  const NavbarApp = {
    data() {
      return {
        user: null,
        loading: true,
      };
    },
    async mounted() {
      try {
        const res = await fetch("/api/user");
        if (res.status === 401) {
          // Let the main app handle redirect or do it here
          return;
        }
        const data = await res.json();
        this.user = data;
      } catch (e) {
        console.error("Nav load error", e);
      } finally {
        this.loading = false;
      }
    },
    template: `
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark border-bottom border-secondary">
            <div class="container-fluid">
                <a class="navbar-brand fw-bold" href="/">
                    <span class="text-primary">Divine</span> Buddha
                </a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                    <span class="navbar-toggler-icon"></span>
                </button>
                
                <div class="collapse navbar-collapse" id="navbarNav" v-if="user">
                    <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                        <li class="nav-item">
                            <a class="nav-link" :class="{ active: isActive('/') }" href="/">Home</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" :class="{ active: isActive('/builder.html') }" href="/builder.html">Embed Builder</a>
                        </li>
                        <li class="nav-item" v-if="user.isAnyAdmin">
                          <a class="nav-link" :class="{ active: isActive('/config.html') }" href="/config.html">Configuration</a>
                        </li>
                        <li class="nav-item" v-if="user.isAnyAdmin">
                          <a class="nav-link" :class="{ active: isActive('/giveaways.html') }" href="/giveaways.html">Giveaways</a>
                        </li>
                        <li class="nav-item" v-if="user.isAnyAdmin">
                          <a class="nav-link" :class="{ active: isActive('/transcripts.html') }" href="/transcripts.html">Transcripts</a>
                        </li>
                        <li class="nav-item" v-if="user.isAnyAdmin">
                          <a class="nav-link" :class="{ active: isActive('/mod-activity.html') }" href="/mod-activity.html">Mod Activity</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" :class="{ active: isActive('/activity.html') }" href="/activity.html">Activity</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" :class="{ active: isActive('/reminders.html') }" href="/reminders.html">Reminders</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" :class="{ active: isActive('/tts-stats.html') }" href="/tts-stats.html">TTS Stats</a>
                        </li>
                    </ul>
                    <div class="d-flex align-items-center gap-3">
                        <div class="text-light small d-none d-lg-block">
                            <img :src="'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.png'" 
                                 class="rounded-circle me-2" width="32" height="32" 
                                 onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                            {{ user.username }}
                        </div>
                        <a href="/logout" class="btn btn-outline-danger btn-sm">Logout</a>
                    </div>
                </div>
            </div>
        </nav>
        `,
    methods: {
      isActive(path) {
        if (path === "/")
          return (
            window.location.pathname === "/" ||
            window.location.pathname === "/index.html"
          );
        return window.location.pathname.includes(path);
      },
    },
  };

  createApp(NavbarApp).mount("#navbar-app");
})();
