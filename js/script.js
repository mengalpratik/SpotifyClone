/**
 * ============================================================================
 * Spotify Web Player 2.0 - Core Application & Music Engine
 * ============================================================================
 * Real Free Music API integration (Apple Music/iTunes Public Catalog + Audius),
 * Web Audio Visualizer, Dynamic Ambient Glow, Real-time Global Search,
 * Queue, Liked Songs (localStorage), and Spotify Desktop Controls.
 */

// ==========================================
// 1. App State & Persistent Storage
// ==========================================
const STORAGE_KEYS = {
  LIKED_SONGS: 'spotify_liked_songs_v2',
  CUSTOM_PLAYLISTS: 'spotify_custom_playlists_v2',
  VOLUME: 'spotify_volume_v2',
  REPEAT: 'spotify_repeat_v2',
  SHUFFLE: 'spotify_shuffle_v2',
  ENGINE: 'spotify_active_engine_v2'
};

const state = {
  activeEngine: localStorage.getItem(STORAGE_KEYS.ENGINE) || 'itunes',
  audio: new Audio(),
  audioContext: null,
  analyser: null,
  visualizerSource: null,
  visualizerActive: false,
  visualizerAnimationId: null,

  currentTrack: null,
  queue: [],
  originalQueue: [],
  queueIndex: -1,
  isPlaying: false,
  isShuffle: localStorage.getItem(STORAGE_KEYS.SHUFFLE) === 'true',
  repeatMode: localStorage.getItem(STORAGE_KEYS.REPEAT) || 'off', // 'off' | 'all' | 'one'
  volume: parseFloat(localStorage.getItem(STORAGE_KEYS.VOLUME) ?? '0.8'),
  isMuted: false,

  likedSongs: JSON.parse(localStorage.getItem(STORAGE_KEYS.LIKED_SONGS) || '[]'),
  customPlaylists: JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_PLAYLISTS) || '[]'),

  currentView: 'home',
  navigationHistory: ['home'],
  historyIndex: 0,
  activePlaylist: null,

  categoryCache: new Map(),
  searchDebounceTimer: null
};

// ==========================================
// 2. Music API Layer (Free, Global, Real)
// ==========================================
const MusicAPI = {
  /**
   * Search tracks using iTunes Public Search API (Zero API key required, full CORS support)
   */
  async searchItunes(query, limit = 25) {
    const encoded = encodeURIComponent(query.trim());
    const url = `https://itunes.apple.com/search?term=${encoded}&entity=song&limit=${limit}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();
      return (data.results || []).map(item => MusicAPI.normalizeItunesTrack(item));
    } catch (err) {
      console.warn('iTunes API error:', err);
      return [];
    }
  },

  /**
   * Normalizes an iTunes song object
   */
  normalizeItunesTrack(item) {
    const rawArtwork = item.artworkUrl100 || item.artworkUrl60 || 'img/cover.jpg';
    // Upscale artwork to 600x600 ultra-HD cover
    const hdArtwork = rawArtwork.replace(/\/\d+x\d+bb\.jpg/i, '/600x600bb.jpg');

    return {
      id: `itunes_${item.trackId}`,
      source: 'itunes',
      title: item.trackName || 'Unknown Title',
      artist: item.artistName || 'Unknown Artist',
      album: item.collectionName || item.trackName || 'Single',
      artwork: hdArtwork,
      thumb: rawArtwork,
      previewUrl: item.previewUrl,
      duration: Math.round((item.trackTimeMillis || 30000) / 1000),
      releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : '2026',
      genre: item.primaryGenreName || 'Music'
    };
  },

  /**
   * Query trending tracks from Audius API
   */
  async getAudiusTrending(limit = 15) {
    const url = `https://discoveryprovider.audius.co/v1/tracks/trending?app_name=SpotifyWebPlayer&limit=${limit}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Audius HTTP Error: ${res.status}`);
      const json = await res.json();
      return (json.data || []).map(item => MusicAPI.normalizeAudiusTrack(item)).filter(t => t.previewUrl);
    } catch (err) {
      console.warn('Audius API error:', err);
      return [];
    }
  },

  /**
   * Normalizes an Audius song object
   */
  normalizeAudiusTrack(item) {
    const artworkObj = item.artwork || {};
    const hdArtwork = artworkObj['1000x1000'] || artworkObj['480x480'] || artworkObj['150x150'] || 'img/cover.jpg';
    const streamUrl = item.stream?.url || (item.id ? `https://discoveryprovider.audius.co/v1/tracks/${item.id}/stream?app_name=SpotifyWebPlayer` : null);

    return {
      id: `audius_${item.id || item.track_id}`,
      source: 'audius',
      title: item.title || 'Audius Track',
      artist: item.user?.name || 'Audius Artist',
      album: item.genre || 'Electronic',
      artwork: hdArtwork,
      thumb: artworkObj['150x150'] || hdArtwork,
      previewUrl: streamUrl,
      duration: item.duration || 180,
      releaseDate: item.release_date ? item.release_date.split('T')[0] : '2026',
      genre: item.genre || 'Trending'
    };
  },

  /**
   * Fetch songs for pre-defined curated categories
   */
  async getCuratedPlaylist(categoryKey) {
    if (state.categoryCache.has(categoryKey)) {
      return state.categoryCache.get(categoryKey);
    }

    let tracks = [];
    switch (categoryKey) {
      case 'top-hits':
        tracks = await MusicAPI.searchItunes('Taylor Swift The Weeknd Billie Eilish Bruno Mars Dua Lipa', 15);
        break;
      case 'punjabi':
        tracks = await MusicAPI.searchItunes('Diljit Dosanjh Karan Aujla AP Dhillon Sidhu Moosewala Shubh', 15);
        break;
      case 'bollywood':
        tracks = await MusicAPI.searchItunes('Arijit Singh Shreya Ghoshal Atif Aslam Pritam Sachin-Jigar', 15);
        break;
      case 'lofi':
        tracks = await MusicAPI.searchItunes('Lofi chillhop study beats ambient sleep', 15);
        break;
      case 'hiphop':
        tracks = await MusicAPI.searchItunes('Drake Kendrick Lamar Travis Scott Eminem Post Malone', 15);
        break;
      case 'mood-chill':
        tracks = await MusicAPI.searchItunes('Acoustic chill indie folk calm', 12);
        break;
      case 'mood-funky':
        tracks = await MusicAPI.searchItunes('Funk disco groove dance party', 12);
        break;
      case 'mood-uplifting':
        tracks = await MusicAPI.searchItunes('Uplifting positive happy energy pop', 12);
        break;
      case 'mood-dark':
        tracks = await MusicAPI.searchItunes('Dark synthwave cinematic gothic bass', 12);
        break;
      case 'mood-love':
        tracks = await MusicAPI.searchItunes('Romantic love ballad acoustic melody', 12);
        break;
      case 'mood-angry':
        tracks = await MusicAPI.searchItunes('Heavy rock metal punk intense energetic', 12);
        break;
      case 'audius':
        tracks = await MusicAPI.getAudiusTrending(15);
        break;
      default:
        tracks = await MusicAPI.searchItunes(categoryKey, 15);
    }

    state.categoryCache.set(categoryKey, tracks);
    return tracks;
  }
};

// ==========================================
// 3. Audio Player Engine
// ==========================================
const Player = {
  init() {
    state.audio.volume = state.volume;
    state.audio.crossOrigin = 'anonymous';

    // Audio Event Listeners
    state.audio.addEventListener('play', () => {
      state.isPlaying = true;
      UI.updatePlaybackUI();
      Visualizer.start();
    });

    state.audio.addEventListener('pause', () => {
      state.isPlaying = false;
      UI.updatePlaybackUI();
      Visualizer.stop();
    });

    state.audio.addEventListener('timeupdate', () => {
      UI.updateProgressUI();
    });

    state.audio.addEventListener('ended', () => {
      if (state.repeatMode === 'one') {
        state.audio.currentTime = 0;
        state.audio.play();
      } else {
        Player.next(true); // auto next
      }
    });

    state.audio.addEventListener('error', (e) => {
      console.warn('Audio playback encountered error, advancing track:', e);
      // Skip to next track smoothly after short delay
      setTimeout(() => {
        if (state.queue.length > 1) {
          Player.next(true);
        }
      }, 800);
    });

    // Setup Media Session API (OS Lockscreen controls)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => Player.play());
      navigator.mediaSession.setActionHandler('pause', () => Player.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => Player.previous());
      navigator.mediaSession.setActionHandler('nexttrack', () => Player.next());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime && state.audio.duration) {
          state.audio.currentTime = details.seekTime;
        }
      });
    }
  },

  /**
   * Load and play a specific track
   */
  async playTrack(track, queueList = null) {
    if (!track || !track.previewUrl) {
      console.warn('Track is missing playable stream URL:', track);
      return;
    }

    if (queueList && queueList.length > 0) {
      state.originalQueue = [...queueList];
      state.queue = state.isShuffle ? Player.shuffleArray([...queueList]) : [...queueList];
      state.queueIndex = state.queue.findIndex(t => t.id === track.id);
      if (state.queueIndex === -1) {
        state.queue.unshift(track);
        state.queueIndex = 0;
      }
    } else if (state.queueIndex === -1) {
      state.queue = [track];
      state.queueIndex = 0;
    }

    state.currentTrack = track;
    state.audio.src = track.previewUrl;
    state.audio.currentTime = 0;

    try {
      await state.audio.play();
    } catch (err) {
      console.warn('Autoplay prevented or stream error:', err);
    }

    UI.updateNowPlayingUI();
    UI.updateAmbientGlow(track);
    UI.updateQueueUI();
    UI.highlightActiveTrack();

    // Update Media Session
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: [
          { src: track.artwork, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
    }
  },

  play() {
    if (!state.currentTrack && state.queue.length > 0) {
      Player.playTrack(state.queue[0]);
    } else if (state.audio.src) {
      state.audio.play().catch(e => console.warn(e));
    }
  },

  pause() {
    state.audio.pause();
  },

  togglePlayPause() {
    if (state.isPlaying) {
      Player.pause();
    } else {
      Player.play();
    }
  },

  next(auto = false) {
    if (state.queue.length === 0) return;

    if (state.queueIndex < state.queue.length - 1) {
      state.queueIndex++;
      Player.playTrack(state.queue[state.queueIndex]);
    } else if (state.repeatMode === 'all') {
      state.queueIndex = 0;
      Player.playTrack(state.queue[0]);
    } else if (!auto) {
      // Loop back to start on manual click
      state.queueIndex = 0;
      Player.playTrack(state.queue[0]);
    }
  },

  previous() {
    if (state.audio.currentTime > 3) {
      state.audio.currentTime = 0;
      return;
    }

    if (state.queueIndex > 0) {
      state.queueIndex--;
      Player.playTrack(state.queue[state.queueIndex]);
    } else {
      state.audio.currentTime = 0;
    }
  },

  seek(percentage) {
    if (state.audio.duration) {
      state.audio.currentTime = state.audio.duration * percentage;
    }
  },

  setVolume(vol) {
    state.volume = Math.max(0, Math.min(1, vol));
    state.audio.volume = state.volume;
    state.isMuted = state.volume === 0;
    localStorage.setItem(STORAGE_KEYS.VOLUME, state.volume.toString());
    UI.updateVolumeUI();
  },

  toggleMute() {
    if (state.isMuted) {
      state.isMuted = false;
      state.audio.volume = state.volume > 0 ? state.volume : 0.7;
    } else {
      state.isMuted = true;
      state.audio.volume = 0;
    }
    UI.updateVolumeUI();
  },

  toggleShuffle() {
    state.isShuffle = !state.isShuffle;
    localStorage.setItem(STORAGE_KEYS.SHUFFLE, state.isShuffle.toString());

    if (state.isShuffle) {
      const current = state.currentTrack;
      const rest = state.originalQueue.filter(t => t.id !== current?.id);
      state.queue = current ? [current, ...Player.shuffleArray(rest)] : Player.shuffleArray([...state.originalQueue]);
      state.queueIndex = 0;
    } else {
      state.queue = [...state.originalQueue];
      state.queueIndex = state.queue.findIndex(t => t.id === state.currentTrack?.id);
      if (state.queueIndex === -1) state.queueIndex = 0;
    }

    UI.updatePlaybackUI();
    UI.updateQueueUI();
  },

  toggleRepeat() {
    if (state.repeatMode === 'off') {
      state.repeatMode = 'all';
    } else if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
    } else {
      state.repeatMode = 'off';
    }
    localStorage.setItem(STORAGE_KEYS.REPEAT, state.repeatMode);
    UI.updatePlaybackUI();
  },

  shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
};

// ==========================================
// 4. Web Audio Real-time Spectrum Visualizer
// ==========================================
const Visualizer = {
  init() {
    const canvas = document.getElementById('visualizerCanvas');
    if (!canvas) return;

    // Responsive Canvas Resize
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement.clientHeight || 64;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
  },

  setupAudioContext() {
    if (state.audioContext) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      state.audioContext = new AudioCtx();
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 128;
      state.analyser.smoothingTimeConstant = 0.8;

      state.visualizerSource = state.audioContext.createMediaElementSource(state.audio);
      state.visualizerSource.connect(state.analyser);
      state.analyser.connect(state.audioContext.destination);
    } catch (err) {
      console.warn('Web Audio Context connection note (CORS / media element):', err);
    }
  },

  toggle() {
    state.visualizerActive = !state.visualizerActive;
    const container = document.getElementById('visualizerContainer');
    const btn = document.getElementById('btnToggleVisualizer');

    if (state.visualizerActive) {
      container.classList.add('active');
      btn.classList.add('active');
      Visualizer.setupAudioContext();
      if (state.audioContext && state.audioContext.state === 'suspended') {
        state.audioContext.resume();
      }
      Visualizer.start();
    } else {
      container.classList.remove('active');
      btn.classList.remove('active');
      Visualizer.stop();
    }
  },

  start() {
    if (!state.visualizerActive) return;
    Visualizer.stop();

    const canvas = document.getElementById('visualizerCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const render = () => {
      state.visualizerAnimationId = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      let bufferLength = 32;
      let dataArray = new Uint8Array(bufferLength);

      if (state.analyser) {
        state.analyser.getByteFrequencyData(dataArray);
      } else {
        // Fallback procedural wave when paused or unlinked
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = state.isPlaying
            ? 50 + Math.sin(Date.now() / 200 + i * 0.3) * 45
            : 10;
        }
      }

      const barWidth = (width / bufferLength) * 0.75;
      const gap = (width / bufferLength) * 0.25;
      let x = gap / 2;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * (height * 0.95);

        // Modern Gradient
        const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
        grad.addColorStop(0, '#1ed760');
        grad.addColorStop(1, '#a6ffc6');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, height - barHeight, barWidth, barHeight, [3, 3, 0, 0]);
        ctx.fill();

        x += barWidth + gap;
      }
    };

    render();
  },

  stop() {
    if (state.visualizerAnimationId) {
      cancelAnimationFrame(state.visualizerAnimationId);
      state.visualizerAnimationId = null;
    }
  }
};

// ==========================================
// 5. UI Controller & View Manager
// ==========================================
const UI = {
  init() {
    UI.setupNavigationEvents();
    UI.setupPlayerEvents();
    UI.setupSearchEvents();
    UI.setupCategoryChips();
    UI.setupLibrary();
    UI.setupKeyboardShortcuts();
    UI.renderInitialShelves();
    UI.updatePlaybackUI();
    UI.updateVolumeUI();
    UI.updateLikedCount();
    Visualizer.init();
  },

  // ----------------------------------------
  // Navigation & View Routing
  // ----------------------------------------
  switchView(viewName, data = null) {
    state.currentView = viewName;
    document.querySelectorAll('.view-panel, .playlist-view, .search-view, .liked-view').forEach(el => {
      el.classList.remove('active');
    });

    // Update active nav link
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    const scrollContainer = document.getElementById('scrollableContent');
    scrollContainer.scrollTop = 0;

    switch (viewName) {
      case 'home':
        document.getElementById('homeView').classList.add('active');
        break;
      case 'search':
        document.getElementById('searchView').classList.add('active');
        document.getElementById('globalSearchInput').focus();
        break;
      case 'liked':
        document.getElementById('likedView').classList.add('active');
        UI.renderLikedSongsView();
        break;
      case 'playlist':
        document.getElementById('playlistView').classList.add('active');
        if (data) UI.renderPlaylistView(data);
        break;
    }
  },

  setupNavigationEvents() {
    // Nav Items (Home, Search, Liked)
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        UI.switchView(item.dataset.view);
      });
    });

    // Mobile Hamburger
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('mobile-open');
    });

    // Close Mobile Sidebar when clicking on content
    document.getElementById('scrollableContent')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.remove('mobile-open');
    });

    // Settings Modal
    document.getElementById('btnOpenApiSettings')?.addEventListener('click', () => {
      document.getElementById('settingsModal')?.classList.add('active');
    });
    document.getElementById('btnCloseModal')?.addEventListener('click', () => {
      document.getElementById('settingsModal')?.classList.remove('active');
    });
    document.getElementById('settingsModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') {
        document.getElementById('settingsModal').classList.remove('active');
      }
    });

    // Provider Selector in Modal
    document.getElementById('btnEngineItunes')?.addEventListener('click', (e) => {
      state.activeEngine = 'itunes';
      localStorage.setItem(STORAGE_KEYS.ENGINE, 'itunes');
      e.target.classList.add('active');
      document.getElementById('btnEngineAudius').classList.remove('active');
      document.getElementById('apiStatusText').textContent = 'iTunes Global Free API';
      document.getElementById('engineStatusInfo').textContent = 'Catalog: 100M+ tracks across Pop, Punjabi, Bollywood, Lo-Fi, Hip-Hop, Rock, Latin. Zero authentication / rate limiting.';
    });

    document.getElementById('btnEngineAudius')?.addEventListener('click', (e) => {
      state.activeEngine = 'audius';
      localStorage.setItem(STORAGE_KEYS.ENGINE, 'audius');
      e.target.classList.add('active');
      document.getElementById('btnEngineItunes').classList.remove('active');
      document.getElementById('apiStatusText').textContent = 'Audius Decentralized API';
      document.getElementById('engineStatusInfo').textContent = 'Catalog: Open decentralized streaming audio tracks with trending EDM, Hip Hop, and Indie music.';
    });

    // Queue Toggle
    document.getElementById('btnToggleQueue')?.addEventListener('click', () => {
      document.getElementById('queueDrawer')?.classList.toggle('active');
    });
    document.getElementById('btnCloseQueue')?.addEventListener('click', () => {
      document.getElementById('queueDrawer')?.classList.remove('active');
    });
    document.getElementById('btnClearQueue')?.addEventListener('click', () => {
      state.queue = state.currentTrack ? [state.currentTrack] : [];
      state.queueIndex = 0;
      UI.updateQueueUI();
    });

    // Visualizer Toggle
    document.getElementById('btnToggleVisualizer')?.addEventListener('click', () => {
      Visualizer.toggle();
    });
  },

  // ----------------------------------------
  // Category Chips Bar
  // ----------------------------------------
  setupCategoryChips() {
    const chips = document.querySelectorAll('#categoryChipsBar .chip');
    chips.forEach(chip => {
      chip.addEventListener('click', async () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const cat = chip.dataset.category;
        if (cat === 'all') {
          UI.switchView('home');
          return;
        }

        // Open as full playlist category view
        const tracks = await MusicAPI.getCuratedPlaylist(cat);
        const titles = {
          'top-hits': { title: "Today's Top Global Hits", desc: 'The biggest global chart-toppers right now.' },
          'punjabi': { title: 'Punjabi Heatwave', desc: 'Bhangra beats, high-octane hip-hop, and urban Punjabi bangers.' },
          'bollywood': { title: 'Bollywood Romance & Soul', desc: 'Heartfelt melodies, timeless love tracks, and Bollywood chartbusters.' },
          'lofi': { title: 'Lo-Fi Chill & Focus', desc: 'Calm rhythms and warm tape beats for deep study or relaxation.' },
          'hiphop': { title: 'Hip-Hop Heavyweights', desc: 'Heavy basslines, bars, and the hottest rap anthems.' },
          'moods': { title: 'Moods & Vibes Mix', desc: 'Handcrafted tracks curated for your current energy and emotions.' },
          'audius': { title: 'Audius Radar', desc: 'Fresh decentralized indie, dance, and electronic music.' }
        };

        const info = titles[cat] || { title: chip.textContent, desc: 'Curated music playlist' };
        UI.switchView('playlist', {
          title: info.title,
          desc: info.desc,
          cover: tracks[0]?.artwork || 'img/cover.jpg',
          tracks: tracks
        });
      });
    });
  },

  // ----------------------------------------
  // Initial Shelves (Home View)
  // ----------------------------------------
  async renderInitialShelves() {
    const container = document.getElementById('dynamicShelvesContainer');
    if (!container) return;

    // Shelves configuration
    const shelfConfigs = [
      { key: 'top-hits', title: "Today's Top Global Hits" },
      { key: 'punjabi', title: "Punjabi Heatwave" },
      { key: 'bollywood', title: "Bollywood Romance & Melodies" },
      { key: 'lofi', title: "Lo-Fi Beats & Chill Study" },
      { key: 'hiphop', title: "Hip-Hop & Rap Heavyweights" },
      { key: 'audius', title: "Audius Trending Radar" }
    ];

    // Render shelves
    for (const shelf of shelfConfigs) {
      const block = document.createElement('section');
      block.className = 'section-block';
      block.innerHTML = `
        <div class="section-header">
          <h2 class="section-title">${shelf.title}</h2>
          <span class="section-show-all" data-shelf="${shelf.key}">Show all</span>
        </div>
        <div class="cards-grid" id="shelfGrid_${shelf.key}">
          <div class="text-subdued text-sm p-4">Loading tracks...</div>
        </div>
      `;
      container.appendChild(block);

      // Async load tracks for each shelf
      MusicAPI.getCuratedPlaylist(shelf.key).then(tracks => {
        const grid = document.getElementById(`shelfGrid_${shelf.key}`);
        if (!grid) return;
        grid.innerHTML = '';

        tracks.slice(0, 6).forEach(track => {
          const card = UI.createMusicCard(track, tracks);
          grid.appendChild(card);
        });

        // Set Hero featured track from first top-hits track
        if (shelf.key === 'top-hits' && tracks.length > 0) {
          UI.updateHeroBanner(tracks[0], tracks);
        }
      });
    }

    // Attach "Show all" click handlers
    container.addEventListener('click', async (e) => {
      const showAllBtn = e.target.closest('.section-show-all');
      if (showAllBtn) {
        const key = showAllBtn.dataset.shelf;
        const tracks = await MusicAPI.getCuratedPlaylist(key);
        const titleEl = showAllBtn.parentElement.querySelector('.section-title');
        UI.switchView('playlist', {
          title: titleEl ? titleEl.textContent : 'Curated Playlist',
          desc: 'Enjoy this hand-picked selection of high-fidelity tracks.',
          cover: tracks[0]?.artwork || 'img/cover.jpg',
          tracks: tracks
        });
      }
    });
  },

  updateHeroBanner(featuredTrack, fullList) {
    const heroTitle = document.getElementById('heroTitle');
    const heroDesc = document.getElementById('heroDesc');
    const heroCover = document.getElementById('heroCover');
    const heroBackdrop = document.getElementById('heroBackdrop');
    const heroPlayBtn = document.getElementById('heroPlayBtn');
    const heroExploreBtn = document.getElementById('heroExploreBtn');

    if (!heroTitle) return;

    heroTitle.textContent = `${featuredTrack.title} — ${featuredTrack.artist}`;
    heroDesc.textContent = `Album: ${featuredTrack.album} • Release: ${featuredTrack.releaseDate}. Listen to top trending music in high quality.`;
    heroCover.src = featuredTrack.artwork;
    heroBackdrop.style.backgroundImage = `url(${featuredTrack.artwork})`;

    heroPlayBtn.onclick = () => Player.playTrack(featuredTrack, fullList);
    heroExploreBtn.onclick = () => {
      UI.switchView('playlist', {
        title: `${featuredTrack.artist} Essentials`,
        desc: `Featured songs and releases by ${featuredTrack.artist}.`,
        cover: featuredTrack.artwork,
        tracks: fullList
      });
    };
  },

  createMusicCard(track, fullList = []) {
    const card = document.createElement('div');
    card.className = `music-card ${state.currentTrack?.id === track.id ? 'playing' : ''}`;
    card.dataset.id = track.id;

    card.innerHTML = `
      <div class="card-thumb-wrapper">
        <img class="card-thumb" src="${track.artwork}" alt="${track.title}" loading="lazy" onerror="this.src='img/cover.jpg'">
        <button class="card-play-btn" title="Play ${track.title}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>
      </div>
      <div class="card-meta">
        <div class="card-title truncate" title="${track.title}">${track.title}</div>
        <div class="card-desc truncate" title="${track.artist}">${track.artist}</div>
      </div>
    `;

    // Click on play button or card
    card.addEventListener('click', (e) => {
      Player.playTrack(track, fullList.length > 0 ? fullList : [track]);
    });

    return card;
  },

  // ----------------------------------------
  // Playlist Detail View
  // ----------------------------------------
  renderPlaylistView(playlistData) {
    state.activePlaylist = playlistData;
    const cover = document.getElementById('playlistHeroCover');
    const title = document.getElementById('playlistTitle');
    const subtitle = document.getElementById('playlistSubtitle');
    const statsCount = document.getElementById('playlistStatsCount');
    const statsDuration = document.getElementById('playlistStatsDuration');
    const tbody = document.getElementById('playlistTracksTbody');

    cover.src = playlistData.cover || 'img/cover.jpg';
    title.textContent = playlistData.title;
    subtitle.textContent = playlistData.desc || 'Curated high fidelity playlist';
    statsCount.textContent = `${playlistData.tracks.length} songs`;

    const totalSeconds = playlistData.tracks.reduce((acc, t) => acc + (t.duration || 30), 0);
    statsDuration.textContent = `${Math.ceil(totalSeconds / 60)} min`;

    tbody.innerHTML = '';
    playlistData.tracks.forEach((track, idx) => {
      const row = UI.createTrackRow(track, idx + 1, playlistData.tracks);
      tbody.appendChild(row);
    });

    // Action bar buttons
    document.getElementById('btnPlayPlaylistAll').onclick = () => {
      if (playlistData.tracks.length > 0) {
        Player.playTrack(playlistData.tracks[0], playlistData.tracks);
      }
    };

    document.getElementById('btnShufflePlaylist').onclick = () => {
      if (playlistData.tracks.length > 0) {
        state.isShuffle = true;
        Player.playTrack(playlistData.tracks[0], playlistData.tracks);
      }
    };

    document.getElementById('btnSavePlaylist').onclick = (e) => {
      UI.saveCustomPlaylist(playlistData.title, playlistData.tracks);
      e.target.style.color = '#1ed760';
    };
  },

  createTrackRow(track, indexNum, fullList) {
    const tr = document.createElement('tr');
    tr.className = `track-row ${state.currentTrack?.id === track.id ? 'active' : ''}`;
    tr.dataset.id = track.id;

    const isLiked = state.likedSongs.some(t => t.id === track.id);

    tr.innerHTML = `
      <td class="track-num-cell">
        <span class="row-index-num">${indexNum}</span>
        <span class="row-play-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </span>
      </td>
      <td>
        <div class="track-title-cell">
          <img class="track-row-thumb" src="${track.thumb || track.artwork}" alt="${track.title}" onerror="this.src='img/cover.jpg'">
          <div class="track-row-details">
            <div class="track-row-name truncate">${track.title}</div>
            <div class="track-row-artist truncate">${track.artist}</div>
          </div>
        </div>
      </td>
      <td class="truncate" style="max-width: 220px;">${track.album}</td>
      <td>${track.releaseDate || '2026'}</td>
      <td class="track-action-cell">
        <div class="flex items-center justify-center gap-2">
          <button class="btn-like ${isLiked ? 'liked' : ''}" data-like-id="${track.id}" title="Like">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <span>${UI.formatSeconds(track.duration || 30)}</span>
        </div>
      </td>
    `;

    // Row Click to play
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.btn-like')) {
        e.stopPropagation();
        UI.toggleLike(track);
        const likeBtn = tr.querySelector('.btn-like');
        const nowLiked = state.likedSongs.some(t => t.id === track.id);
        likeBtn.classList.toggle('liked', nowLiked);
        likeBtn.querySelector('svg').setAttribute('fill', nowLiked ? 'currentColor' : 'none');
        likeBtn.classList.add('pop-anim');
        setTimeout(() => likeBtn.classList.remove('pop-anim'), 350);
        return;
      }
      Player.playTrack(track, fullList);
    });

    return tr;
  },

  // ----------------------------------------
  // Live Universal Search
  // ----------------------------------------
  setupSearchEvents() {
    const input = document.getElementById('globalSearchInput');
    const clearBtn = document.getElementById('searchClearBtn');

    input.addEventListener('input', () => {
      const query = input.value.trim();
      clearBtn.classList.toggle('visible', query.length > 0);

      clearTimeout(state.searchDebounceTimer);
      if (!query) return;

      state.searchDebounceTimer = setTimeout(() => {
        UI.executeLiveSearch(query);
      }, 300);
    });

    input.addEventListener('focus', () => {
      if (state.currentView !== 'search') {
        UI.switchView('search');
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.remove('visible');
      input.focus();
    });
  },

  async executeLiveSearch(query) {
    UI.switchView('search');

    const topResultEl = document.getElementById('topResultCard');
    const songsTbody = document.getElementById('searchSongsTbody');
    const extraGrid = document.getElementById('searchExtraGrid');

    topResultEl.innerHTML = '<div class="text-subdued text-sm">Searching global library...</div>';
    songsTbody.innerHTML = '<tr><td colspan="5" class="text-subdued text-sm p-4">Loading songs...</td></tr>';
    extraGrid.innerHTML = '';

    const results = await MusicAPI.searchItunes(query, 20);

    if (results.length === 0) {
      topResultEl.innerHTML = `<div class="text-subdued text-sm">No results found for "${query}". Try searching an artist, track, or genre.</div>`;
      songsTbody.innerHTML = '';
      return;
    }

    const topTrack = results[0];

    // Render Top Result Card
    topResultEl.innerHTML = `
      <img class="top-result-thumb" src="${topTrack.artwork}" alt="${topTrack.title}" onerror="this.src='img/cover.jpg'">
      <div class="top-result-name truncate">${topTrack.title}</div>
      <div class="flex items-center gap-3">
        <span class="top-result-badge">Song</span>
        <span class="text-subdued text-sm font-semibold">${topTrack.artist}</span>
      </div>
      <button class="card-play-btn" style="opacity: 1; transform: none; position: absolute; bottom: 20px; right: 20px;" title="Play">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </button>
    `;
    topResultEl.onclick = () => Player.playTrack(topTrack, results);

    // Render Songs Column (top 5 songs)
    songsTbody.innerHTML = '';
    results.slice(0, 5).forEach((track, i) => {
      const row = UI.createTrackRow(track, i + 1, results);
      songsTbody.appendChild(row);
    });

    // Render Related Releases / Cards Grid
    results.slice(5, 17).forEach(track => {
      const card = UI.createMusicCard(track, results);
      extraGrid.appendChild(card);
    });
  },

  // ----------------------------------------
  // Liked Songs Management
  // ----------------------------------------
  toggleLike(track) {
    const idx = state.likedSongs.findIndex(t => t.id === track.id);
    if (idx > -1) {
      state.likedSongs.splice(idx, 1);
    } else {
      state.likedSongs.unshift(track);
    }
    localStorage.setItem(STORAGE_KEYS.LIKED_SONGS, JSON.stringify(state.likedSongs));
    UI.updateLikedCount();
    UI.updateNowPlayingUI();
    if (state.currentView === 'liked') {
      UI.renderLikedSongsView();
    }
  },

  updateLikedCount() {
    const count = state.likedSongs.length;
    const metaEl = document.getElementById('libraryLikedCount');
    if (metaEl) metaEl.textContent = `Pinned • ${count} ${count === 1 ? 'song' : 'songs'}`;
    const textEl = document.getElementById('likedCountText');
    if (textEl) textEl.textContent = `${count} ${count === 1 ? 'song' : 'songs'}`;
  },

  renderLikedSongsView() {
    const tbody = document.getElementById('likedTracksTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (state.likedSongs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-subdued text-center">No liked songs yet! Click the heart on any track to save it here.</td></tr>`;
      return;
    }

    state.likedSongs.forEach((track, idx) => {
      const row = UI.createTrackRow(track, idx + 1, state.likedSongs);
      tbody.appendChild(row);
    });

    document.getElementById('btnPlayLikedAll').onclick = () => {
      if (state.likedSongs.length > 0) {
        Player.playTrack(state.likedSongs[0], state.likedSongs);
      }
    };
  },

  // ----------------------------------------
  // Custom Playlists & Library
  // ----------------------------------------
  setupLibrary() {
    // Liked songs pinned click
    document.querySelector('.library-item[data-action="liked-songs"]')?.addEventListener('click', () => {
      UI.switchView('liked');
    });

    // Create playlist button
    document.getElementById('btnCreatePlaylist')?.addEventListener('click', () => {
      const name = prompt('Enter a name for your new playlist:', `My Playlist #${state.customPlaylists.length + 1}`);
      if (name && name.trim()) {
        UI.saveCustomPlaylist(name.trim(), state.currentTrack ? [state.currentTrack] : []);
      }
    });

    UI.renderLibraryPlaylists();
  },

  saveCustomPlaylist(title, tracks = []) {
    const newPlaylist = {
      id: `pl_${Date.now()}`,
      title: title,
      desc: 'Created by you • Saved locally',
      cover: tracks[0]?.artwork || 'img/cover.jpg',
      tracks: tracks
    };

    state.customPlaylists.unshift(newPlaylist);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_PLAYLISTS, JSON.stringify(state.customPlaylists));
    UI.renderLibraryPlaylists();
  },

  renderLibraryPlaylists() {
    const list = document.getElementById('libraryItemsList');
    if (!list) return;

    // Preserve liked-songs pinned element
    const pinned = list.querySelector('[data-action="liked-songs"]');
    list.innerHTML = '';
    if (pinned) list.appendChild(pinned);

    state.customPlaylists.forEach(pl => {
      const item = document.createElement('div');
      item.className = 'library-item';
      item.innerHTML = `
        <img class="library-item-thumb" src="${pl.cover}" alt="${pl.title}" onerror="this.src='img/cover.jpg'">
        <div class="library-item-details">
          <div class="library-item-title truncate">${pl.title}</div>
          <div class="library-item-meta">Playlist • ${pl.tracks.length} songs</div>
        </div>
      `;
      item.onclick = () => {
        UI.switchView('playlist', pl);
      };
      list.appendChild(item);
    });
  },

  // ----------------------------------------
  // Playbar & Audio Controls
  // ----------------------------------------
  setupPlayerEvents() {
    // Play / Pause
    document.getElementById('btnPlayPause')?.addEventListener('click', () => Player.togglePlayPause());
    document.getElementById('btnNext')?.addEventListener('click', () => Player.next());
    document.getElementById('btnPrevious')?.addEventListener('click', () => Player.previous());
    document.getElementById('btnShuffle')?.addEventListener('click', () => Player.toggleShuffle());
    document.getElementById('btnRepeat')?.addEventListener('click', () => Player.toggleRepeat());

    // Like button in player
    document.getElementById('playerLikeBtn')?.addEventListener('click', () => {
      if (state.currentTrack) {
        UI.toggleLike(state.currentTrack);
      }
    });

    // Seekbar scrubbing
    const progressBarContainer = document.getElementById('progressBarContainer');
    let isSeeking = false;

    const handleSeek = (e) => {
      const rect = progressBarContainer.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      Player.seek(pos);
    };

    progressBarContainer.addEventListener('mousedown', (e) => {
      isSeeking = true;
      handleSeek(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (isSeeking) handleSeek(e);
    });

    window.addEventListener('mouseup', () => {
      if (isSeeking) isSeeking = false;
    });

    // Volume Slider
    const volumeTrack = document.getElementById('volumeSliderTrack');
    let isAdjustingVolume = false;

    const handleVolume = (e) => {
      const rect = volumeTrack.getBoundingClientRect();
      const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      Player.setVolume(vol);
    };

    volumeTrack.addEventListener('mousedown', (e) => {
      isAdjustingVolume = true;
      handleVolume(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (isAdjustingVolume) handleVolume(e);
    });

    window.addEventListener('mouseup', () => {
      if (isAdjustingVolume) isAdjustingVolume = false;
    });

    document.getElementById('btnMuteToggle')?.addEventListener('click', () => Player.toggleMute());
  },

  updateNowPlayingUI() {
    const track = state.currentTrack;
    if (!track) return;

    const thumb = document.getElementById('playerThumb');
    const title = document.getElementById('playerTitle');
    const artist = document.getElementById('playerArtist');
    const likeBtn = document.getElementById('playerLikeBtn');

    thumb.src = track.artwork;
    title.textContent = track.title;
    artist.textContent = track.artist;

    const isLiked = state.likedSongs.some(t => t.id === track.id);
    likeBtn.classList.toggle('liked', isLiked);
    likeBtn.querySelector('svg').setAttribute('fill', isLiked ? 'currentColor' : 'none');

    // Title / Artist click jumps to playlist or search
    artist.onclick = () => {
      document.getElementById('globalSearchInput').value = track.artist;
      UI.executeLiveSearch(track.artist);
    };
  },

  updatePlaybackUI() {
    const playPauseBtn = document.getElementById('btnPlayPause');
    const playIconSvg = document.getElementById('playIconSvg');

    if (state.isPlaying) {
      playIconSvg.innerHTML = `
        <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
        <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
      `;
    } else {
      playIconSvg.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
    }

    // Shuffle & Repeat states
    const shuffleBtn = document.getElementById('btnShuffle');
    shuffleBtn.classList.toggle('active', state.isShuffle);

    const repeatBtn = document.getElementById('btnRepeat');
    repeatBtn.classList.toggle('active', state.repeatMode !== 'off');
    if (state.repeatMode === 'one') {
      repeatBtn.title = 'Repeat One';
      repeatBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="17 1 21 5 17 9"/>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <polyline points="7 23 3 19 7 15"/>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          <text x="10" y="15" font-size="8" fill="currentColor" font-weight="bold">1</text>
        </svg>
      `;
    } else {
      repeatBtn.title = 'Repeat (R)';
      repeatBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="17 1 21 5 17 9"/>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <polyline points="7 23 3 19 7 15"/>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
      `;
    }
  },

  updateProgressUI() {
    const curTime = state.audio.currentTime || 0;
    const duration = state.audio.duration || 30;

    const curText = document.getElementById('currentTimeText');
    const durText = document.getElementById('totalDurationText');
    const fill = document.getElementById('progressBarFill');

    if (curText) curText.textContent = UI.formatSeconds(curTime);
    if (durText) durText.textContent = UI.formatSeconds(duration);

    const pct = Math.min(100, Math.max(0, (curTime / duration) * 100));
    if (fill) fill.style.width = `${pct}%`;
  },

  updateVolumeUI() {
    const fill = document.getElementById('volumeFill');
    const icon = document.getElementById('volumeIconSvg');
    const effectiveVol = state.isMuted ? 0 : state.volume;

    if (fill) fill.style.width = `${effectiveVol * 100}%`;

    if (effectiveVol === 0) {
      icon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2"/>
        <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2"/>
      `;
    } else if (effectiveVol < 0.5) {
      icon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      `;
    } else {
      icon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
      `;
    }
  },

  updateQueueUI() {
    const nowPlaying = document.getElementById('queueNowPlaying');
    const queueList = document.getElementById('queueList');
    if (!nowPlaying || !queueList) return;

    if (state.currentTrack) {
      nowPlaying.innerHTML = `
        <div class="library-item active mt-1">
          <img class="library-item-thumb" src="${state.currentTrack.artwork}" alt="">
          <div class="library-item-details">
            <div class="library-item-title truncate">${state.currentTrack.title}</div>
            <div class="library-item-meta truncate">${state.currentTrack.artist}</div>
          </div>
        </div>
      `;
    } else {
      nowPlaying.innerHTML = '<div class="text-xs text-subdued p-2">Nothing playing</div>';
    }

    queueList.innerHTML = '';
    const nextTracks = state.queue.slice(state.queueIndex + 1);
    if (nextTracks.length === 0) {
      queueList.innerHTML = '<div class="text-xs text-subdued p-2">Queue is empty</div>';
      return;
    }

    nextTracks.forEach((t, i) => {
      const item = document.createElement('div');
      item.className = 'library-item';
      item.innerHTML = `
        <img class="library-item-thumb" src="${t.thumb || t.artwork}" alt="">
        <div class="library-item-details">
          <div class="library-item-title truncate">${t.title}</div>
          <div class="library-item-meta truncate">${t.artist}</div>
        </div>
      `;
      item.onclick = () => {
        state.queueIndex = state.queueIndex + 1 + i;
        Player.playTrack(t);
      };
      queueList.appendChild(item);
    });
  },

  highlightActiveTrack() {
    const curId = state.currentTrack?.id;
    document.querySelectorAll('.track-row').forEach(row => {
      row.classList.toggle('active', row.dataset.id === curId);
    });
    document.querySelectorAll('.music-card').forEach(card => {
      card.classList.toggle('playing', card.dataset.id === curId);
    });
  },

  updateAmbientGlow(track) {
    const glowEl = document.getElementById('ambientGlow');
    if (!glowEl) return;

    // Dynamic color tint based on genre or title hash
    const genre = (track.genre || '').toLowerCase();
    let r = 30, g = 215, b = 96; // default spotify green

    if (genre.includes('punjabi') || genre.includes('bhangra') || genre.includes('indian')) {
      r = 255; g = 120; b = 30; // vibrant saffron/orange
    } else if (genre.includes('bollywood') || genre.includes('romantic') || genre.includes('love')) {
      r = 235; g = 50; b = 135; // passionate magenta/rose
    } else if (genre.includes('lofi') || genre.includes('chill') || genre.includes('ambient')) {
      r = 110; g = 80; b = 240; // deep purple / indigo
    } else if (genre.includes('hip') || genre.includes('rap')) {
      r = 0; g = 200; b = 255; // electric cyan
    } else if (genre.includes('rock') || genre.includes('metal') || genre.includes('angry')) {
      r = 240; g = 40; b = 50; // crimson
    } else {
      // Deterministic hash from artist string
      let hash = 0;
      for (let i = 0; i < track.artist.length; i++) {
        hash = track.artist.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = Math.abs(hash % 360);
      glowEl.style.background = `radial-gradient(circle at 50% -20%, hsla(${hue}, 80%, 50%, 0.2) 0%, rgba(18, 18, 18, 0) 75%)`;
      return;
    }

    glowEl.style.background = `radial-gradient(circle at 50% -20%, rgba(${r}, ${g}, ${b}, 0.22) 0%, rgba(18, 18, 18, 0) 75%)`;
  },

  // ----------------------------------------
  // Keyboard Shortcuts
  // ----------------------------------------
  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore if user is currently typing inside an input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          Player.togglePlayPause();
          break;
        case 'KeyN':
          Player.next();
          break;
        case 'KeyP':
          Player.previous();
          break;
        case 'KeyM':
          Player.toggleMute();
          break;
        case 'KeyS':
          Player.toggleShuffle();
          break;
        case 'KeyR':
          Player.toggleRepeat();
          break;
        case 'KeyL':
          if (state.currentTrack) UI.toggleLike(state.currentTrack);
          break;
        case 'ArrowRight':
          e.preventDefault();
          state.audio.currentTime = Math.min(state.audio.duration || 30, state.audio.currentTime + 5);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          state.audio.currentTime = Math.max(0, state.audio.currentTime - 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          Player.setVolume(state.volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          Player.setVolume(state.volume - 0.05);
          break;
        case 'KeyK':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            document.getElementById('globalSearchInput')?.focus();
          }
          break;
        case 'Slash':
          e.preventDefault();
          document.getElementById('globalSearchInput')?.focus();
          break;
      }
    });
  },

  formatSeconds(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
};

// ==========================================
// 6. Application Bootstrap
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  Player.init();
  UI.init();
  console.log('⚡ Spotify Web Player 2.0 initialized with Live Free Song API Engine');
});