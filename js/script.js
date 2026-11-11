/**
 * ============================================================================
 * Spotify Web Player 2.0 - Core Application & Music Engine
 * ============================================================================
 * Features:
 * - Multi-engine Music API (Apple Music/iTunes, Audius, Jamendo, Custom Proxy)
 * - Persistent API Settings & Credentials (localStorage)
 * - Fully Responsive across Mobile, Tablet, and Desktop
 * - Mobile Mini Player & Fullscreen Player Sheet
 * - Real-time Web Audio Spectrum Visualizer
 * - Dynamic Ambient Lighting & Color Extraction
 * - Real-time Debounced Global Search
 * - Queue Drawer & Liked Songs Library
 */

// ==========================================
// 1. App State & Persistent Storage Keys
// ==========================================
const STORAGE_KEYS = {
  ENGINE: 'spotify_active_engine_v3',
  API_KEYS: 'spotify_api_keys_v3',
  LIKED_SONGS: 'spotify_liked_songs_v2',
  CUSTOM_PLAYLISTS: 'spotify_custom_playlists_v2',
  VOLUME: 'spotify_volume_v2',
  REPEAT: 'spotify_repeat_v2',
  SHUFFLE: 'spotify_shuffle_v2'
};

const savedApiKeys = JSON.parse(
  localStorage.getItem(STORAGE_KEYS.API_KEYS) || '{"jamendo":"","customEndpoint":"","customKey":""}'
);

const state = {
  activeEngine: localStorage.getItem(STORAGE_KEYS.ENGINE) || 'itunes',
  apiKeys: savedApiKeys,
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
  activePlaylist: null,
  categoryCache: new Map(),
  searchDebounceTimer: null
};

// ==========================================
// 2. Music API Layer (Multi-Engine & Persistent)
// ==========================================
const MusicAPI = {
  /**
   * Universal search router based on state.activeEngine
   */
  async search(query, limit = 25) {
    if (!query || !query.trim()) return [];

    try {
      if (state.activeEngine === 'audius') {
        const audiusTracks = await MusicAPI.searchAudius(query, limit);
        if (audiusTracks.length > 0) return audiusTracks;
      } else if (state.activeEngine === 'jamendo' && state.apiKeys.jamendo) {
        const jamendoTracks = await MusicAPI.searchJamendo(query, limit, state.apiKeys.jamendo);
        if (jamendoTracks.length > 0) return jamendoTracks;
      } else if (state.activeEngine === 'custom' && state.apiKeys.customEndpoint) {
        const customTracks = await MusicAPI.searchCustom(query, limit, state.apiKeys.customEndpoint, state.apiKeys.customKey);
        if (customTracks.length > 0) return customTracks;
      }
    } catch (e) {
      console.warn('Selected engine failed, falling back to iTunes:', e);
    }

    // Default & reliable fallback: iTunes Public Search
    return await MusicAPI.searchItunes(query, limit);
  },

  /**
   * Search tracks using iTunes Public Search API (100% Free, No key, 100M+ songs)
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

  normalizeItunesTrack(item) {
    const rawArtwork = item.artworkUrl100 || item.artworkUrl60 || 'img/cover.jpg';
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
   * Search tracks using Audius API
   */
  async searchAudius(query, limit = 20) {
    const encoded = encodeURIComponent(query.trim());
    const url = `https://discoveryprovider.audius.co/v1/tracks/search?query=${encoded}&app_name=SpotifyWebPlayer&limit=${limit}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Audius HTTP Error: ${res.status}`);
      const json = await res.json();
      return (json.data || []).map(item => MusicAPI.normalizeAudiusTrack(item)).filter(t => t.previewUrl);
    } catch (err) {
      console.warn('Audius API search error:', err);
      return [];
    }
  },

  /**
   * Get trending tracks from Audius API
   */
  async getAudiusTrending(limit = 15) {
    const url = `https://discoveryprovider.audius.co/v1/tracks/trending?app_name=SpotifyWebPlayer&limit=${limit}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Audius HTTP Error: ${res.status}`);
      const json = await res.json();
      return (json.data || []).map(item => MusicAPI.normalizeAudiusTrack(item)).filter(t => t.previewUrl);
    } catch (err) {
      console.warn('Audius trending error:', err);
      return [];
    }
  },

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
   * Search tracks using Jamendo Music API (Free Client ID)
   */
  async searchJamendo(query, limit = 20, clientId = '') {
    if (!clientId) return [];
    const encoded = encodeURIComponent(query.trim());
    const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=${limit}&namesearch=${encoded}&include=musicinfo`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Jamendo Error: ${res.status}`);
      const json = await res.json();
      if (json.headers?.status !== 'success') throw new Error(json.headers?.error_message || 'Jamendo error');

      return (json.results || []).map(item => ({
        id: `jamendo_${item.id}`,
        source: 'jamendo',
        title: item.name,
        artist: item.artist_name,
        album: item.album_name || 'Single',
        artwork: item.image || 'img/cover.jpg',
        thumb: item.image || 'img/cover.jpg',
        previewUrl: item.audio,
        duration: item.duration || 180,
        releaseDate: item.releasedate || '2026',
        genre: item.musicinfo?.tags?.genres?.[0] || 'Indie'
      })).filter(t => t.previewUrl);
    } catch (err) {
      console.warn('Jamendo API search failed:', err);
      return [];
    }
  },

  /**
   * Search Custom User Endpoint
   */
  async searchCustom(query, limit = 20, endpoint = '', apiKey = '') {
    if (!endpoint) return [];
    const fullUrl = endpoint.includes('?') ? `${endpoint}&q=${encodeURIComponent(query)}&limit=${limit}` : `${endpoint}?q=${encodeURIComponent(query)}&limit=${limit}`;
    const headers = {};
    if (apiKey) {
      headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    }

    try {
      const res = await fetch(fullUrl, { headers });
      if (!res.ok) throw new Error(`Custom API Error: ${res.status}`);
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.tracks || json.results || json.data || []);
      return list.map((item, idx) => ({
        id: item.id || `custom_${idx}`,
        source: 'custom',
        title: item.title || item.name || 'Unknown',
        artist: item.artist || item.artistName || 'Unknown Artist',
        album: item.album || 'Single',
        artwork: item.artwork || item.cover || 'img/cover.jpg',
        thumb: item.thumb || item.artwork || 'img/cover.jpg',
        previewUrl: item.streamUrl || item.previewUrl || item.audio || item.url,
        duration: item.duration || 180,
        releaseDate: item.releaseDate || '2026',
        genre: item.genre || 'Music'
      })).filter(t => t.previewUrl);
    } catch (err) {
      console.warn('Custom API fetch failed:', err);
      return [];
    }
  },

  /**
   * Live Latency & Connectivity Test
   */
  async testConnection(engine, keys) {
    const t0 = performance.now();
    try {
      if (engine === 'itunes') {
        const res = await fetch('https://itunes.apple.com/search?term=test&limit=1');
        const dt = Math.round(performance.now() - t0);
        if (res.ok) {
          return { success: true, latency: dt, message: `Connected (${dt}ms) • 100M+ songs online` };
        }
      } else if (engine === 'audius') {
        const res = await fetch('https://discoveryprovider.audius.co/v1/tracks/trending?app_name=SpotifyWebPlayer&limit=1');
        const dt = Math.round(performance.now() - t0);
        if (res.ok) {
          return { success: true, latency: dt, message: `Connected (${dt}ms) • Decentralized stream ready` };
        }
      } else if (engine === 'jamendo') {
        if (!keys.jamendo) {
          return { success: false, latency: 0, message: 'Please enter a Jamendo Client ID' };
        }
        const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=${keys.jamendo}&format=json&limit=1&namesearch=test`);
        const json = await res.json();
        const dt = Math.round(performance.now() - t0);
        if (json.headers?.status === 'success') {
          return { success: true, latency: dt, message: `Connected (${dt}ms) • Jamendo API Authorized` };
        } else {
          return { success: false, latency: dt, message: json.headers?.error_message || 'Authorization failed' };
        }
      } else if (engine === 'custom') {
        if (!keys.customEndpoint) {
          return { success: false, latency: 0, message: 'Please enter a custom API endpoint URL' };
        }
        const res = await fetch(keys.customEndpoint);
        const dt = Math.round(performance.now() - t0);
        return { success: res.ok, latency: dt, message: res.ok ? `Connected (${dt}ms) • Endpoint verified` : `HTTP Error ${res.status}` };
      }
    } catch (err) {
      return { success: false, latency: 0, message: `Connection error: ${err.message}` };
    }
    return { success: false, latency: 0, message: 'Test failed' };
  },

  /**
   * Fetch songs for curated playlists
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
        Player.next(true);
      }
    });

    state.audio.addEventListener('error', (e) => {
      console.warn('Audio playback error, auto-advancing:', e);
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

  async playTrack(track, queueList = null) {
    if (!track || !track.previewUrl) {
      console.warn('Track is missing stream URL:', track);
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
      console.warn('Web Audio Context connection note:', err);
    }
  },

  toggle() {
    state.visualizerActive = !state.visualizerActive;
    const container = document.getElementById('visualizerContainer');
    const btn = document.getElementById('btnToggleVisualizer');
    const mobileBtn = document.getElementById('btnMobileVisualizerToggle');

    if (state.visualizerActive) {
      container.classList.add('active');
      btn?.classList.add('active');
      mobileBtn?.classList.add('active');
      Visualizer.setupAudioContext();
      if (state.audioContext && state.audioContext.state === 'suspended') {
        state.audioContext.resume();
      }
      Visualizer.start();
      UI.showToast('Audio Spectrum Visualizer Active');
    } else {
      container.classList.remove('active');
      btn?.classList.remove('active');
      mobileBtn?.classList.remove('active');
      Visualizer.stop();
      UI.showToast('Visualizer Paused');
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
    UI.setupMobilePlayerEvents();
    UI.setupSearchEvents();
    UI.setupCategoryChips();
    UI.setupLibrary();
    UI.setupKeyboardShortcuts();
    UI.setupApiManager();
    UI.renderInitialShelves();
    UI.updatePlaybackUI();
    UI.updateVolumeUI();
    UI.updateLikedCount();
    Visualizer.init();
  },

  showToast(message) {
    const toast = document.getElementById('toastNotification');
    const msgEl = document.getElementById('toastMessage');
    if (!toast || !msgEl) return;

    msgEl.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  },

  // ----------------------------------------
  // Navigation & View Routing
  // ----------------------------------------
  switchView(viewName, data = null) {
    state.currentView = viewName;
    document.querySelectorAll('.view-panel, .playlist-view, .search-view, .liked-view').forEach(el => {
      el.classList.remove('active');
    });

    // Update active nav links (Desktop & Mobile)
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });
    document.querySelectorAll('.mobile-nav-item[data-view]').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    const scrollContainer = document.getElementById('scrollableContent');
    scrollContainer.scrollTop = 0;

    // Close mobile sidebar if open
    UI.closeMobileSidebar();

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

  closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebarBackdrop')?.classList.remove('active');
  },

  openMobileSidebar() {
    document.getElementById('sidebar')?.classList.add('mobile-open');
    document.getElementById('sidebarBackdrop')?.classList.add('active');
  },

  setupNavigationEvents() {
    // Nav Items (Home, Search, Liked)
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        UI.switchView(item.dataset.view);
      });
    });

    // Mobile Bottom Nav Items
    document.querySelectorAll('.mobile-nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        UI.switchView(item.dataset.view);
      });
    });

    document.getElementById('mobileNavLibraryBtn')?.addEventListener('click', () => {
      UI.openMobileSidebar();
    });

    document.getElementById('mobileNavSettingsBtn')?.addEventListener('click', () => {
      document.getElementById('settingsModal')?.classList.add('active');
    });

    // Mobile Hamburger
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
      UI.openMobileSidebar();
    });

    // Sidebar Backdrop Click Dismiss
    document.getElementById('sidebarBackdrop')?.addEventListener('click', () => {
      UI.closeMobileSidebar();
    });

    // Settings Modal Open/Close
    document.getElementById('btnOpenApiSettings')?.addEventListener('click', () => {
      document.getElementById('settingsModal')?.classList.add('active');
    });
    document.getElementById('btnProfile')?.addEventListener('click', () => {
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
      UI.showToast('Queue cleared');
    });

    // Visualizer Toggle
    document.getElementById('btnToggleVisualizer')?.addEventListener('click', () => Visualizer.toggle());
    document.getElementById('btnMobileVisualizerToggle')?.addEventListener('click', () => Visualizer.toggle());
  },

  // ----------------------------------------
  // Persistent API Manager & Key Settings
  // ----------------------------------------
  setupApiManager() {
    const cardItunes = document.getElementById('cardEngineItunes');
    const cardAudius = document.getElementById('cardEngineAudius');
    const cardJamendo = document.getElementById('cardEngineJamendo');
    const cardCustom = document.getElementById('cardEngineCustom');

    const inputJamendo = document.getElementById('inputJamendoKey');
    const inputCustomEndpoint = document.getElementById('inputCustomEndpoint');
    const inputCustomKey = document.getElementById('inputCustomKey');

    const groupJamendo = document.getElementById('groupJamendoInputs');
    const groupCustom = document.getElementById('groupCustomInputs');

    // Populate inputs from saved state
    if (inputJamendo) inputJamendo.value = state.apiKeys.jamendo || '';
    if (inputCustomEndpoint) inputCustomEndpoint.value = state.apiKeys.customEndpoint || '';
    if (inputCustomKey) inputCustomKey.value = state.apiKeys.customKey || '';

    // Function to update visual card selection
    const selectEngineCard = (engine) => {
      document.querySelectorAll('.api-engine-card').forEach(c => c.classList.remove('active'));
      const activeCard = document.querySelector(`.api-engine-card[data-engine="${engine}"]`);
      activeCard?.classList.add('active');

      if (groupJamendo) groupJamendo.style.display = engine === 'jamendo' ? 'block' : 'none';
      if (groupCustom) groupCustom.style.display = engine === 'custom' ? 'block' : 'none';

      UI.updateTopBarApiPill(engine);
    };

    // Initialize with persistent engine
    selectEngineCard(state.activeEngine);

    // Card click events
    document.querySelectorAll('.api-engine-card').forEach(card => {
      card.addEventListener('click', () => {
        const engine = card.dataset.engine;
        selectEngineCard(engine);
      });
    });

    // Test Latency Connection Button
    document.getElementById('btnTestApiConnection')?.addEventListener('click', async () => {
      const activeCard = document.querySelector('.api-engine-card.active');
      const selectedEngine = activeCard?.dataset.engine || 'itunes';
      const testDot = document.getElementById('apiTestDot');
      const testStatus = document.getElementById('apiTestStatus');

      testDot.className = 'api-status-dot yellow';
      testStatus.textContent = 'Testing connection...';

      const tempKeys = {
        jamendo: inputJamendo?.value.trim() || '',
        customEndpoint: inputCustomEndpoint?.value.trim() || '',
        customKey: inputCustomKey?.value.trim() || ''
      };

      const result = await MusicAPI.testConnection(selectedEngine, tempKeys);
      if (result.success) {
        testDot.className = 'api-status-dot';
        testStatus.textContent = result.message;
        UI.showToast(`✓ API Verified (${result.latency}ms)`);
      } else {
        testDot.className = 'api-status-dot red';
        testStatus.textContent = result.message;
      }
    });

    // Save & Apply Settings Button (Persistent)
    document.getElementById('btnSaveApiSettings')?.addEventListener('click', () => {
      const activeCard = document.querySelector('.api-engine-card.active');
      const newEngine = activeCard?.dataset.engine || 'itunes';

      state.activeEngine = newEngine;
      state.apiKeys = {
        jamendo: inputJamendo?.value.trim() || '',
        customEndpoint: inputCustomEndpoint?.value.trim() || '',
        customKey: inputCustomKey?.value.trim() || ''
      };

      localStorage.setItem(STORAGE_KEYS.ENGINE, state.activeEngine);
      localStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(state.apiKeys));

      UI.updateTopBarApiPill(state.activeEngine);
      document.getElementById('settingsModal')?.classList.remove('active');
      UI.showToast(`✓ Engine changed to ${UI.getEngineLabel(state.activeEngine)}`);
    });

    // Reset to Default Button
    document.getElementById('btnResetApiSettings')?.addEventListener('click', () => {
      state.activeEngine = 'itunes';
      state.apiKeys = { jamendo: '', customEndpoint: '', customKey: '' };

      localStorage.setItem(STORAGE_KEYS.ENGINE, 'itunes');
      localStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(state.apiKeys));

      if (inputJamendo) inputJamendo.value = '';
      if (inputCustomEndpoint) inputCustomEndpoint.value = '';
      if (inputCustomKey) inputCustomKey.value = '';

      selectEngineCard('itunes');
      document.getElementById('apiTestStatus').textContent = 'Reset to Apple Music / iTunes (Global Free)';
      document.getElementById('apiTestDot').className = 'api-status-dot';
      UI.showToast('✓ Reset to Default (iTunes Free)');
    });
  },

  getEngineLabel(engine) {
    switch (engine) {
      case 'audius': return 'Audius (Free)';
      case 'jamendo': return 'Jamendo (Key)';
      case 'custom': return 'Custom API';
      default: return 'iTunes (Free)';
    }
  },

  updateTopBarApiPill(engine) {
    const textEl = document.getElementById('apiStatusText');
    if (textEl) textEl.textContent = UI.getEngineLabel(engine);
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

    const shelfConfigs = [
      { key: 'top-hits', title: "Today's Top Global Hits" },
      { key: 'punjabi', title: "Punjabi Heatwave" },
      { key: 'bollywood', title: "Bollywood Romance & Melodies" },
      { key: 'lofi', title: "Lo-Fi Beats & Chill Study" },
      { key: 'hiphop', title: "Hip-Hop & Rap Heavyweights" },
      { key: 'audius', title: "Audius Trending Radar" }
    ];

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

      MusicAPI.getCuratedPlaylist(shelf.key).then(tracks => {
        const grid = document.getElementById(`shelfGrid_${shelf.key}`);
        if (!grid) return;
        grid.innerHTML = '';

        tracks.slice(0, 6).forEach(track => {
          const card = UI.createMusicCard(track, tracks);
          grid.appendChild(card);
        });

        if (shelf.key === 'top-hits' && tracks.length > 0) {
          UI.updateHeroBanner(tracks[0], tracks);
        }
      });
    }

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

    card.addEventListener('click', () => {
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
      UI.showToast(`Saved "${playlistData.title}" to Your Library!`);
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
      <td class="truncate col-hide-mobile" style="max-width: 220px;">${track.album}</td>
      <td class="col-hide-mobile">${track.releaseDate || '2026'}</td>
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

    const results = await MusicAPI.search(query, 20);

    if (results.length === 0) {
      topResultEl.innerHTML = `<div class="text-subdued text-sm">No results found for "${query}". Try another artist, track, or genre.</div>`;
      songsTbody.innerHTML = '';
      return;
    }

    const topTrack = results[0];

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

    songsTbody.innerHTML = '';
    results.slice(0, 5).forEach((track, i) => {
      const row = UI.createTrackRow(track, i + 1, results);
      songsTbody.appendChild(row);
    });

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
      UI.showToast(`Removed from Liked Songs`);
    } else {
      state.likedSongs.unshift(track);
      UI.showToast(`Added to Liked Songs`);
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
    document.querySelector('.library-item[data-action="liked-songs"]')?.addEventListener('click', () => {
      UI.switchView('liked');
    });

    document.getElementById('btnCreatePlaylist')?.addEventListener('click', () => {
      const name = prompt('Enter a name for your new playlist:', `My Playlist #${state.customPlaylists.length + 1}`);
      if (name && name.trim()) {
        UI.saveCustomPlaylist(name.trim(), state.currentTrack ? [state.currentTrack] : []);
        UI.showToast(`Playlist "${name.trim()}" created!`);
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
  // Desktop Playbar Events
  // ----------------------------------------
  setupPlayerEvents() {
    document.getElementById('btnPlayPause')?.addEventListener('click', () => Player.togglePlayPause());
    document.getElementById('btnNext')?.addEventListener('click', () => Player.next());
    document.getElementById('btnPrevious')?.addEventListener('click', () => Player.previous());
    document.getElementById('btnShuffle')?.addEventListener('click', () => Player.toggleShuffle());
    document.getElementById('btnRepeat')?.addEventListener('click', () => Player.toggleRepeat());

    document.getElementById('playerLikeBtn')?.addEventListener('click', () => {
      if (state.currentTrack) UI.toggleLike(state.currentTrack);
    });

    const progressBarContainer = document.getElementById('progressBarContainer');
    let isSeeking = false;

    const handleSeek = (e) => {
      const rect = progressBarContainer.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      Player.seek(pos);
    };

    progressBarContainer?.addEventListener('mousedown', (e) => {
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

    volumeTrack?.addEventListener('mousedown', (e) => {
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

  // ----------------------------------------
  // Mobile Player & Mini-Player Events
  // ----------------------------------------
  setupMobilePlayerEvents() {
    // Open Fullscreen Overlay
    document.getElementById('miniPlayerExpandTrigger')?.addEventListener('click', () => {
      document.getElementById('mobilePlayerOverlay')?.classList.add('active');
    });

    // Collapse Overlay
    document.getElementById('btnCollapseMobilePlayer')?.addEventListener('click', () => {
      document.getElementById('mobilePlayerOverlay')?.classList.remove('active');
    });

    // Mini Player Quick Controls
    document.getElementById('miniPlayerPlayBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      Player.togglePlayPause();
    });

    document.getElementById('miniPlayerLikeBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.currentTrack) UI.toggleLike(state.currentTrack);
    });

    // Mobile Fullscreen Controls
    document.getElementById('mobileBtnPlayPause')?.addEventListener('click', () => Player.togglePlayPause());
    document.getElementById('mobileBtnNext')?.addEventListener('click', () => Player.next());
    document.getElementById('mobileBtnPrev')?.addEventListener('click', () => Player.previous());
    document.getElementById('mobileBtnShuffle')?.addEventListener('click', () => Player.toggleShuffle());
    document.getElementById('mobileBtnRepeat')?.addEventListener('click', () => Player.toggleRepeat());
    document.getElementById('mobilePlayerLikeBtn')?.addEventListener('click', () => {
      if (state.currentTrack) UI.toggleLike(state.currentTrack);
    });
    document.getElementById('mobileBtnMute')?.addEventListener('click', () => Player.toggleMute());
    document.getElementById('mobileBtnQueue')?.addEventListener('click', () => {
      document.getElementById('mobilePlayerOverlay')?.classList.remove('active');
      document.getElementById('queueDrawer')?.classList.add('active');
    });

    // Mobile Scrubber
    const mobileProgressContainer = document.getElementById('mobileProgressContainer');
    let isMobileSeeking = false;

    const handleMobileSeek = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const rect = mobileProgressContainer.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      Player.seek(pos);
    };

    mobileProgressContainer?.addEventListener('mousedown', (e) => {
      isMobileSeeking = true;
      handleMobileSeek(e);
    });
    mobileProgressContainer?.addEventListener('touchstart', (e) => {
      isMobileSeeking = true;
      handleMobileSeek(e);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (isMobileSeeking) handleMobileSeek(e);
    }, { passive: true });
    window.addEventListener('touchend', () => {
      if (isMobileSeeking) isMobileSeeking = false;
    });

    // Mobile Volume Slider
    const mobileVolTrack = document.getElementById('mobileVolumeTrack');
    let isMobileVolSeeking = false;

    const handleMobileVol = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const rect = mobileVolTrack.getBoundingClientRect();
      const vol = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      Player.setVolume(vol);
    };

    mobileVolTrack?.addEventListener('mousedown', (e) => {
      isMobileVolSeeking = true;
      handleMobileVol(e);
    });
    mobileVolTrack?.addEventListener('touchstart', (e) => {
      isMobileVolSeeking = true;
      handleMobileVol(e);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (isMobileVolSeeking) handleMobileVol(e);
    }, { passive: true });
    window.addEventListener('touchend', () => {
      if (isMobileVolSeeking) isMobileVolSeeking = false;
    });
  },

  updateNowPlayingUI() {
    const track = state.currentTrack;
    if (!track) return;

    const isLiked = state.likedSongs.some(t => t.id === track.id);

    // Desktop
    const thumb = document.getElementById('playerThumb');
    const title = document.getElementById('playerTitle');
    const artist = document.getElementById('playerArtist');
    const likeBtn = document.getElementById('playerLikeBtn');

    if (thumb) thumb.src = track.artwork;
    if (title) title.textContent = track.title;
    if (artist) artist.textContent = track.artist;
    if (likeBtn) {
      likeBtn.classList.toggle('liked', isLiked);
      likeBtn.querySelector('svg')?.setAttribute('fill', isLiked ? 'currentColor' : 'none');
    }

    // Mobile Mini Player
    const miniThumb = document.getElementById('miniPlayerThumb');
    const miniTitle = document.getElementById('miniPlayerTitle');
    const miniArtist = document.getElementById('miniPlayerArtist');
    const miniLikeBtn = document.getElementById('miniPlayerLikeBtn');

    if (miniThumb) miniThumb.src = track.thumb || track.artwork;
    if (miniTitle) miniTitle.textContent = track.title;
    if (miniArtist) miniArtist.textContent = track.artist;
    if (miniLikeBtn) {
      miniLikeBtn.classList.toggle('liked', isLiked);
      miniLikeBtn.querySelector('svg')?.setAttribute('fill', isLiked ? 'currentColor' : 'none');
    }

    // Mobile Fullscreen Player Overlay
    const fullCover = document.getElementById('mobilePlayerCover');
    const fullTitle = document.getElementById('mobilePlayerTitle');
    const fullArtist = document.getElementById('mobilePlayerArtist');
    const fullLikeBtn = document.getElementById('mobilePlayerLikeBtn');
    const fullContext = document.getElementById('mobilePlayerContext');

    if (fullCover) fullCover.src = track.artwork;
    if (fullTitle) fullTitle.textContent = track.title;
    if (fullArtist) fullArtist.textContent = track.artist;
    if (fullContext) fullContext.textContent = track.album || 'Playing Song';
    if (fullLikeBtn) {
      fullLikeBtn.classList.toggle('liked', isLiked);
      fullLikeBtn.querySelector('svg')?.setAttribute('fill', isLiked ? 'currentColor' : 'none');
    }
  },

  updatePlaybackUI() {
    // Desktop Play/Pause Icon
    const playIconSvg = document.getElementById('playIconSvg');
    if (playIconSvg) {
      playIconSvg.innerHTML = state.isPlaying
        ? `<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>`
        : `<polygon points="5 3 19 12 5 21 5 3"/>`;
    }

    // Mobile Mini Play Icon
    const miniPlayIconSvg = document.getElementById('miniPlayIconSvg');
    if (miniPlayIconSvg) {
      miniPlayIconSvg.innerHTML = state.isPlaying
        ? `<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>`
        : `<polygon points="5 3 19 12 5 21 5 3"/>`;
    }

    // Mobile Fullscreen Play Icon
    const mobilePlayIconSvg = document.getElementById('mobilePlayIconSvg');
    if (mobilePlayIconSvg) {
      mobilePlayIconSvg.innerHTML = state.isPlaying
        ? `<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>`
        : `<polygon points="5 3 19 12 5 21 5 3"/>`;
    }

    // Shuffle & Repeat states (Desktop & Mobile)
    const shuffleBtn = document.getElementById('btnShuffle');
    const mobileShuffleBtn = document.getElementById('mobileBtnShuffle');
    shuffleBtn?.classList.toggle('active', state.isShuffle);
    mobileShuffleBtn?.classList.toggle('active', state.isShuffle);

    const repeatBtn = document.getElementById('btnRepeat');
    const mobileRepeatBtn = document.getElementById('mobileBtnRepeat');
    repeatBtn?.classList.toggle('active', state.repeatMode !== 'off');
    mobileRepeatBtn?.classList.toggle('active', state.repeatMode !== 'off');
  },

  updateProgressUI() {
    const curTime = state.audio.currentTime || 0;
    const duration = state.audio.duration || 30;

    // Desktop
    const curText = document.getElementById('currentTimeText');
    const durText = document.getElementById('totalDurationText');
    const fill = document.getElementById('progressBarFill');

    if (curText) curText.textContent = UI.formatSeconds(curTime);
    if (durText) durText.textContent = UI.formatSeconds(duration);

    const pct = Math.min(100, Math.max(0, (curTime / duration) * 100));
    if (fill) fill.style.width = `${pct}%`;

    // Mobile Fullscreen
    const mobileCurText = document.getElementById('mobileCurTimeText');
    const mobileDurText = document.getElementById('mobileTotalDurText');
    const mobileFill = document.getElementById('mobileProgressFill');

    if (mobileCurText) mobileCurText.textContent = UI.formatSeconds(curTime);
    if (mobileDurText) mobileDurText.textContent = UI.formatSeconds(duration);
    if (mobileFill) mobileFill.style.width = `${pct}%`;
  },

  updateVolumeUI() {
    const fill = document.getElementById('volumeFill');
    const mobileFill = document.getElementById('mobileVolumeFill');
    const icon = document.getElementById('volumeIconSvg');
    const effectiveVol = state.isMuted ? 0 : state.volume;

    if (fill) fill.style.width = `${effectiveVol * 100}%`;
    if (mobileFill) mobileFill.style.width = `${effectiveVol * 100}%`;

    if (icon) {
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

    const genre = (track.genre || '').toLowerCase();
    let r = 30, g = 215, b = 96;

    if (genre.includes('punjabi') || genre.includes('bhangra') || genre.includes('indian')) {
      r = 255; g = 120; b = 30;
    } else if (genre.includes('bollywood') || genre.includes('romantic') || genre.includes('love')) {
      r = 235; g = 50; b = 135;
    } else if (genre.includes('lofi') || genre.includes('chill') || genre.includes('ambient')) {
      r = 110; g = 80; b = 240;
    } else if (genre.includes('hip') || genre.includes('rap')) {
      r = 0; g = 200; b = 255;
    } else if (genre.includes('rock') || genre.includes('metal') || genre.includes('angry')) {
      r = 240; g = 40; b = 50;
    } else {
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
  console.log('⚡ Spotify Web Player 2.0 Pro Ready');
});