// Core App State
const state = {
  currentView: "home-view",
  currentProvider: "hianime", // Default backing provider
  activeAnime: null,
  activeEpisodesList: [],
  currentPlayingEpisode: null,
  plyrPlayer: null,
  hlsInstance: null,
  toastTimeout: null,
  hlsRecoveryAttempts: 0
};

// DOM Elements
const elements = {
  navLogo: document.getElementById("nav-logo"),
  homeNavBtn: document.getElementById("home-nav-btn"),
  searchInput: document.getElementById("search-input"),
  searchClearBtn: document.getElementById("search-clear-btn"),
  providerSelect: document.getElementById("provider-select"),
  
  // Views
  views: {
    home: document.getElementById("home-view"),
    search: document.getElementById("search-view"),
    details: document.getElementById("details-view"),
    watch: document.getElementById("watch-view")
  },
  
  // Grid / Lists
  trendingGrid: document.getElementById("trending-grid"),
  searchGrid: document.getElementById("search-grid"),
  searchQueryTitle: document.getElementById("search-query-title"),
  episodesGrid: document.getElementById("episodes-grid"),
  sidebarEpisodesGrid: document.getElementById("sidebar-episodes-grid"),
  episodesSearch: document.getElementById("episodes-search"),
  
  // Hero
  heroBanner: document.getElementById("hero-banner"),
  heroTitle: document.getElementById("hero-title"),
  heroDescription: document.getElementById("hero-description"),
  heroRating: document.getElementById("hero-rating"),
  heroType: document.getElementById("hero-type"),
  heroStatus: document.getElementById("hero-status"),
  heroPlayBtn: document.getElementById("hero-play-btn"),
  heroInfoBtn: document.getElementById("hero-info-btn"),
  
  // Details
  detailsBgBanner: document.getElementById("details-bg-banner"),
  detailsPoster: document.getElementById("details-poster"),
  detailsTitle: document.getElementById("details-title"),
  detailsJpTitle: document.getElementById("details-jp-title"),
  detailsGenres: document.getElementById("details-genres"),
  detailsRating: document.getElementById("details-rating"),
  detailsStatus: document.getElementById("details-status"),
  detailsEpCount: document.getElementById("details-ep-count"),
  detailsRelease: document.getElementById("details-release"),
  detailsDescription: document.getElementById("details-description"),
  
  // Watch
  watchTitle: document.getElementById("watch-title"),
  watchEpNumber: document.getElementById("watch-ep-number"),
  watchEpTitle: document.getElementById("watch-ep-title"),
  watchBackBtn: document.getElementById("watch-back-btn"),
  videoPlayer: document.getElementById("player"),
  
  // Toast
  toast: document.getElementById("toast")
};

// Initialize the Application
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  initPlayer();
  loadHomePage();
});

// Setup Plyr Video Player
function initPlayer() {
  state.plyrPlayer = new Plyr(elements.videoPlayer, {
    controls: [
      'play-large', 'play', 'progress', 'current-time', 'duration',
      'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
    ],
    settings: ['quality', 'speed', 'loop']
  });
}

// Global Event Listeners
function setupEventListeners() {
  // Logo & Home Navigation Click
  elements.navLogo.addEventListener("click", (e) => {
    e.preventDefault();
    clearSearch();
    showView("home");
  });
  elements.homeNavBtn.addEventListener("click", () => {
    clearSearch();
    showView("home");
  });
  
  // Provider Selector Change
  elements.providerSelect.addEventListener("change", (e) => {
    state.currentProvider = e.target.value;
    showToast(`Switched provider to ${e.target.value === "hianime" ? "Hianime" : "AnimePahe"}`);
    
    // Reload active view state
    if (state.currentView === "home-view") {
      loadHomePage();
    } else if (state.currentView === "search-view" && elements.searchInput.value.trim()) {
      triggerSearch(elements.searchInput.value.trim());
    } else if (state.currentView === "details-view" && state.activeAnime) {
      loadDetailsView(state.activeAnime.id);
    }
  });

  // Search Input Event
  elements.searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const query = elements.searchInput.value.trim();
      if (query) {
        triggerSearch(query);
      }
    }
  });
  
  // Search Input Text Handling
  elements.searchInput.addEventListener("input", () => {
    if (elements.searchInput.value.length > 0) {
      elements.searchClearBtn.classList.remove("hidden");
    } else {
      elements.searchClearBtn.classList.add("hidden");
    }
  });

  // Clear Search Button
  elements.searchClearBtn.addEventListener("click", () => {
    clearSearch();
    showView("home");
  });
  
  // Episodes Filter Search
  elements.episodesSearch.addEventListener("input", (e) => {
    const filter = e.target.value.trim().toLowerCase();
    filterEpisodes(filter);
  });

  // Back Button from Streaming view
  elements.watchBackBtn.addEventListener("click", () => {
    if (state.plyrPlayer) state.plyrPlayer.stop();
    showView("details");
  });
}

// Core Navigation (SPA Routing)
function showView(viewName) {
  const viewId = `${viewName}-view`;
  state.currentView = viewId;
  
  // Stop playback and clean up stream when navigating away from the watch page
  if (viewName !== "watch") {
    if (state.plyrPlayer) {
      try {
        state.plyrPlayer.stop();
      } catch (err) {
        console.error("Error stopping player:", err);
      }
    }
    if (state.hlsInstance) {
      try {
        state.hlsInstance.destroy();
        state.hlsInstance = null;
      } catch (err) {
        console.error("Error destroying HLS instance:", err);
      }
    }
  }

  Object.keys(elements.views).forEach(key => {
    if (key === viewName) {
      elements.views[key].classList.add("active");
    } else {
      elements.views[key].classList.remove("active");
    }
  });
  
  // Scroll to top of viewport
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Show Alert Toast Message (Fix: Toast Race Condition)
function showToast(message, duration = 3000) {
  if (state.toastTimeout) {
    clearTimeout(state.toastTimeout);
  }
  
  elements.toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${message}`;
  elements.toast.classList.remove("hidden");
  
  state.toastTimeout = setTimeout(() => {
    elements.toast.classList.add("hidden");
    state.toastTimeout = null;
  }, duration);
}

// Search Clear
function clearSearch() {
  elements.searchInput.value = "";
  elements.searchClearBtn.classList.add("hidden");
}

// Load Home Page (Trending Section & Hero Banner)
async function loadHomePage() {
  // Show Skeletons
  elements.trendingGrid.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;

  try {
    const response = await fetch(`/api/trending?provider=${state.currentProvider}`);
    if (!response.ok) throw new Error("Failed to fetch trending anime");
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      // 1. Render Hero Banner (pick the top result)
      const featured = data.results[0];
      renderHeroBanner(featured);
      
      // 2. Render Grid
      elements.trendingGrid.innerHTML = "";
      data.results.forEach(anime => {
        elements.trendingGrid.appendChild(createAnimeCard(anime));
      });
    } else {
      elements.trendingGrid.innerHTML = `<p class="no-results">No trending anime found for this provider.</p>`;
    }
  } catch (error) {
    console.error("Home loading error:", error);
    elements.trendingGrid.innerHTML = `<p class="no-results"><i class="fa-solid fa-triangle-exclamation"></i> Error loading trending feed: ${error.message}</p>`;
    
    // Fix: Frozen Hero Banner on Loading Failure
    elements.heroBanner.style.backgroundImage = "url('https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1920')";
    elements.heroTitle.textContent = "Aether Premium Anime";
    elements.heroDescription.textContent = "Discover and watch premium, high-definition anime streams. Try searching for a title in the search bar above or choose a different provider.";
    elements.heroRating.innerHTML = `<i class="fa-solid fa-star"></i> 10.0`;
    elements.heroType.innerHTML = `<i class="fa-solid fa-tv"></i> TV/Movies`;
    elements.heroStatus.innerHTML = `<i class="fa-solid fa-clock"></i> Completed/Ongoing`;
    
    elements.heroPlayBtn.onclick = () => showToast("Search for an anime below to begin!");
    elements.heroInfoBtn.onclick = () => showToast("Search for an anime below to begin!");
  }
}

// Render Hero Banner Content
function renderHeroBanner(anime) {
  elements.heroBanner.style.backgroundImage = anime.cover ? `url('${anime.cover}')` : anime.image ? `url('${anime.image}')` : "";
  elements.heroTitle.textContent = anime.title.english || anime.title.romaji || anime.title;
  
  // Strip HTML tags from description if present
  const desc = anime.description ? anime.description.replace(/<\/?[^>]+(>|$)/g, "") : "No description available.";
  elements.heroDescription.textContent = desc;
  
  elements.heroRating.innerHTML = `<i class="fa-solid fa-star"></i> ${anime.rating ? (anime.rating / 10).toFixed(1) : "N/A"}`;
  elements.heroType.innerHTML = `<i class="fa-solid fa-tv"></i> ${anime.type || "Anime"}`;
  elements.heroStatus.innerHTML = `<i class="fa-solid fa-clock"></i> ${anime.status || "Ongoing"}`;
  
  // Set Actions
  elements.heroPlayBtn.onclick = () => loadDetailsView(anime.id);
  elements.heroInfoBtn.onclick = () => loadDetailsView(anime.id);
}

// Trigger Search View
async function triggerSearch(query) {
  showView("search");
  elements.searchQueryTitle.textContent = `Search results for: "${query}"`;
  
  elements.searchGrid.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&provider=${state.currentProvider}`);
    if (!response.ok) throw new Error("Search failed");
    const data = await response.json();
    
    elements.searchGrid.innerHTML = "";
    if (data.results && data.results.length > 0) {
      data.results.forEach(anime => {
        elements.searchGrid.appendChild(createAnimeCard(anime));
      });
    } else {
      elements.searchGrid.innerHTML = `<p class="no-results">No results found for "${query}". Try another provider.</p>`;
    }
  } catch (error) {
    console.error("Search error:", error);
    elements.searchGrid.innerHTML = `<p class="no-results"><i class="fa-solid fa-triangle-exclamation"></i> Search failed: ${error.message}</p>`;
  }
}

// Create Anime Card DOM Element
function createAnimeCard(anime) {
  const card = document.createElement("div");
  card.className = "anime-card";
  
  const ratingText = anime.rating ? (anime.rating / 10).toFixed(1) : "N/A";
  const title = anime.title.english || anime.title.romaji || anime.title;
  
  card.innerHTML = `
    <div class="card-img">
      <img src="${anime.image || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=300'}" alt="${title}" loading="lazy">
      <div class="card-rating"><i class="fa-solid fa-star"></i> ${ratingText}</div>
      ${anime.totalEpisodes ? `<div class="card-episodes">EPS ${anime.totalEpisodes}</div>` : ""}
      <div class="card-overlay">
        <h3 class="card-title">${title}</h3>
        <div class="card-metadata">
          <span class="card-type">${anime.type || "TV"}</span>
          <span class="card-status">${anime.status || "Ongoing"}</span>
        </div>
      </div>
    </div>
  `;
  
  card.onclick = () => loadDetailsView(anime.id);
  return card;
}

// Fetch and load Anime Details page
async function loadDetailsView(id) {
  showView("details");
  
  // Reset details values
  elements.detailsTitle.textContent = "Loading Anime Details...";
  elements.detailsJpTitle.textContent = "";
  elements.detailsGenres.innerHTML = "";
  elements.detailsPoster.src = "";
  elements.detailsBgBanner.style.backgroundImage = "";
  elements.detailsDescription.textContent = "";
  elements.detailsRating.innerHTML = `<i class="fa-solid fa-star"></i> --`;
  elements.detailsStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> --`;
  elements.detailsEpCount.innerHTML = `<i class="fa-solid fa-video"></i> -- Episodes`;
  elements.detailsRelease.innerHTML = `<i class="fa-solid fa-calendar"></i> --`;
  elements.episodesGrid.innerHTML = `<div class="skeleton-card" style="grid-column: 1/-1; height: 100px;"></div>`;
  elements.episodesSearch.value = "";
  
  try {
    const response = await fetch(`/api/info/${id}?provider=${state.currentProvider}`);
    if (!response.ok) throw new Error("Failed to load details");
    const info = await response.json();
    
    state.activeAnime = info;
    state.activeEpisodesList = info.episodes || [];
    
    // Set UI Values
    elements.detailsTitle.textContent = info.title.english || info.title.romaji || info.title;
    elements.detailsJpTitle.textContent = info.title.native || info.title.romaji || "";
    elements.detailsPoster.src = info.image;
    elements.detailsBgBanner.style.backgroundImage = info.cover ? `url('${info.cover}')` : `url('${info.image}')`;
    elements.detailsDescription.innerHTML = info.description || "No description available.";
    
    const ratingVal = info.rating ? (info.rating / 10).toFixed(1) : "N/A";
    elements.detailsRating.innerHTML = `<i class="fa-solid fa-star"></i> ${ratingVal}`;
    elements.detailsStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${info.status || "Completed"}`;
    elements.detailsEpCount.innerHTML = `<i class="fa-solid fa-video"></i> ${state.activeEpisodesList.length} Episodes`;
    elements.detailsRelease.innerHTML = `<i class="fa-solid fa-calendar"></i> ${info.releaseDate || info.season || "N/A"}`;
    
    // Genres
    elements.detailsGenres.innerHTML = "";
    if (info.genres) {
      info.genres.forEach(genre => {
        const badge = document.createElement("span");
        badge.className = "genre-badge";
        badge.textContent = genre;
        elements.detailsGenres.appendChild(badge);
      });
    }
    
    // Render Episodes list
    renderEpisodes(state.activeEpisodesList);
    
  } catch (error) {
    console.error("Details loading error:", error);
    elements.detailsTitle.textContent = "Error Loading Details";
    elements.episodesGrid.innerHTML = `<p class="no-results"><i class="fa-solid fa-triangle-exclamation"></i> Details fetch failed: ${error.message}</p>`;
  }
}

// Render list of episodes
function renderEpisodes(episodes) {
  elements.episodesGrid.innerHTML = "";
  
  if (episodes.length === 0) {
    elements.episodesGrid.innerHTML = `<p class="no-results">No episodes found for this anime. Try another provider.</p>`;
    return;
  }
  
  episodes.forEach(ep => {
    const btn = document.createElement("button");
    btn.className = "episode-btn";
    btn.textContent = ep.number;
    btn.title = ep.title || `Episode ${ep.number}`;
    btn.onclick = () => loadWatchView(ep);
    elements.episodesGrid.appendChild(btn);
  });
}

// Filter episode numbers on search input
function filterEpisodes(filterText) {
  if (!filterText) {
    renderEpisodes(state.activeEpisodesList);
    return;
  }
  
  const filtered = state.activeEpisodesList.filter(ep => 
    String(ep.number).includes(filterText) || 
    (ep.title && ep.title.toLowerCase().includes(filterText))
  );
  
  renderEpisodes(filtered);
}

// Load Watch/Player page
async function loadWatchView(episode) {
  showView("watch");
  state.currentPlayingEpisode = episode;
  
  // Set UI Text
  const animeTitle = state.activeAnime ? (state.activeAnime.title.english || state.activeAnime.title.romaji) : "Streaming";
  elements.watchTitle.textContent = animeTitle;
  elements.watchEpNumber.textContent = `Episode ${episode.number}`;
  elements.watchEpTitle.textContent = episode.title || "Now Playing";
  
  // Sidebar Highlights
  renderSidebarEpisodesList();

  // Reset player state
  if (state.plyrPlayer) state.plyrPlayer.stop();
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }

  showToast("Fetching video sources, please wait...");
  
  try {
    const response = await fetch(`/api/sources?episodeId=${encodeURIComponent(episode.id)}&provider=${state.currentProvider}`);
    if (!response.ok) throw new Error("Failed to load stream sources");
    const data = await response.json();
    
    // Fix: Unhandled Exception on Empty Video Sources
    if (!data || !data.sources || data.sources.length === 0) {
      throw new Error("No playable video sources returned from scraper.");
    }

    // Gogoanime / AnimeSaturn typically return HLS playlist .m3u8 sources
    const m3u8Source = data.sources.find(s => s.isM3U8 || s.url.includes(".m3u8"));
    const fallbackSource = data.sources[0];
    
    const finalSource = m3u8Source || fallbackSource;
    if (!finalSource) {
      throw new Error("No playable video sources found");
    }

    console.log("[App] Setting video stream url:", finalSource.url);
    playStream(finalSource.url);
    
  } catch (error) {
    console.error("Watch loading error:", error);
    showToast(`Failed to load video: ${error.message}`);
    elements.watchEpTitle.textContent = `Stream Error: ${error.message}`;
  }
}

// Setup Hls.js/Plyr to play .m3u8 stream
function playStream(url) {
  const video = elements.videoPlayer;
  
  if (Hls.isSupported() && url.includes(".m3u8")) {
    state.hlsInstance = new Hls({
      maxMaxBufferLength: 30, // Optimize loading buffer size
      enableWorker: true
    });
    state.hlsInstance.loadSource(url);
    state.hlsInstance.attachMedia(video);
    
    state.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      state.hlsRecoveryAttempts = 0; // Reset consecutive recovery attempts on successful load
      if (state.plyrPlayer) state.plyrPlayer.play().catch(e => console.log("Auto-play blocked"));
    });
    
    state.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        // Fix: Infinite HLS Recovery Loop Prevention
        state.hlsRecoveryAttempts = (state.hlsRecoveryAttempts || 0) + 1;
        if (state.hlsRecoveryAttempts > 3) {
          console.error("HLS fatal errors exceeded max recovery attempts. Stopping.");
          showToast("Playback failed due to multiple HLS connection errors. Try switching providers.");
          elements.watchEpTitle.textContent = "Playback failed: Server link is unreachable or expired.";
          state.hlsInstance.destroy();
          state.hlsInstance = null;
          return;
        }

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log("Fatal network error in HLS client. Retrying...");
            state.hlsInstance.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log("Fatal media error. Recovering...");
            state.hlsInstance.recoverMediaError();
            break;
          default:
            console.log("Fatal playback error. Stopping playback.");
            state.hlsInstance.destroy();
            break;
        }
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native iOS HLS support
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
      if (state.plyrPlayer) state.plyrPlayer.play().catch(e => console.log("Auto-play blocked"));
    });
  } else {
    // Fallback standard MP4 URL
    video.src = url;
    if (state.plyrPlayer) state.plyrPlayer.play().catch(e => console.log("Auto-play blocked"));
  }
}

// Render watch view sidebar episodes selection
function renderSidebarEpisodesList() {
  elements.sidebarEpisodesGrid.innerHTML = "";
  
  state.activeEpisodesList.forEach(ep => {
    const btn = document.createElement("button");
    btn.className = "sidebar-ep-btn";
    if (state.currentPlayingEpisode && state.currentPlayingEpisode.id === ep.id) {
      btn.classList.add("active");
    }
    btn.textContent = ep.number;
    btn.onclick = () => loadWatchView(ep);
    elements.sidebarEpisodesGrid.appendChild(btn);
  });
}
