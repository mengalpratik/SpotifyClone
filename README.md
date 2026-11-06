# 🎵 Spotify Web Player 2.0 (Pro Edition)

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-1ed760?style=for-the-badge&logo=spotify&logoColor=black)](https://mengalpratik.github.io/SpotifyClone/)
[![Deployment Status](https://img.shields.io/github/actions/workflow/status/mengalpratik/SpotifyClone/static.yml?branch=main&style=for-the-badge&label=GitHub%20Pages)](https://mengalpratik.github.io/SpotifyClone/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

A modern, high-fidelity **Spotify Web Player** built with vanilla ES6+ JavaScript, CSS3 Glassmorphism, and HTML5 Web Audio API. Powered by **real, free-to-use music catalog APIs** with zero API key configuration needed out of the box, bringing instant playback of 100M+ songs to life!

👉 **[Launch Live Web Player](https://mengalpratik.github.io/SpotifyClone/)**

![Spotify Web Player 2.0](img/cover.jpg)

---

## ✨ Features

- 🎧 **Real, Free Music Catalog (100M+ Songs)**:
  - Powered by the **Apple Music / iTunes Public Catalog API** (100% free, no API keys, no rate limits, zero CORS restrictions).
  - Alternative decentralized streaming support with **Audius API**.
  - High-fidelity streaming audio previews that load and play instantly without lag or buffering.
  - Ultra HD 600×600 album artwork upscaled dynamically for crystal-clear visuals.
- 🎨 **Next-Gen Spotify Desktop UI & Glassmorphism**:
  - Obsidian Dark theme (`#0b0b0b`) with authentic Spotify Green accents (`#1ed760`).
  - **Dynamic Ambient Glow**: Ambient background lighting that dynamically adapts its color aura to match the currently playing song's vibe and genre.
  - Tactile card hover elevations, floating green play buttons, and interactive equalizer animations.
- 🔍 **Universal Live Search**:
  - Real-time debounced search bar (`Ctrl + K` or `/`).
  - Instant categorized results: "Top Result" card, Songs table, and Related Releases & Artists.
- 🎼 **Curated Playlists & Mood Shelves**:
  - *Today's Top Global Hits* (The Weeknd, Taylor Swift, Billie Eilish, Bruno Mars, Dua Lipa)
  - *Punjabi Heatwave* (Diljit Dosanjh, Karan Aujla, AP Dhillon, Sidhu Moosewala)
  - *Bollywood Romance & Soul* (Arijit Singh, Shreya Ghoshal, Atif Aslam, Pritam)
  - *Lo-Fi Chill & Study*
  - *Hip-Hop Heavyweights*
  - *Moods & Vibes* (Chill, Funky, Uplifting, Dark, Love, Angry)
  - *Audius Trending Radar*
- 📊 **Real-time Web Audio Spectrum Visualizer**:
  - Built with the HTML5 `AudioContext` and `AnalyserNode`.
  - Live frequency spectrum visualizer reacting directly to the musical rhythm and basslines.
- 📋 **Full Playlist & Album Detail Views**:
  - Large banner with blurred backdrop, play all button, shuffle, total duration, and interactive track table (`#`, `Title`, `Album`, `Date`, `Duration`, `Like`).
- 💖 **Liked Songs & Custom Playlists**:
  - One-click heart toggling with pop animations.
  - LocalStorage persistence: your favorites and created playlists stay saved across sessions.
- ⏭️ **Queue Manager**:
  - Slide-over queue drawer displaying "Now Playing" and upcoming tracks with instant track skipping.
- 🎛️ **Precision Player Bar**:
  - Shuffle, Previous, Play/Pause circle, Next, Repeat (Off / All / One).
  - Interactive scrubbable progress bar with buffer progress and live timestamp indicators.
  - Multi-state volume slider with instant mute toggle.
- ⌨️ **Global Keyboard Shortcuts**:
  - `Space` : Play / Pause
  - `N` / `P` : Next / Previous track
  - `Arrow Right` / `Arrow Left` : Seek +5s / -5s
  - `Arrow Up` / `Arrow Down` : Volume ±5%
  - `M` : Mute / Unmute
  - `L` : Like current track
  - `S` : Toggle Shuffle mode
  - `R` : Toggle Repeat mode
  - `Ctrl + K` or `/` : Quick focus search
  - `Esc` : Close modals / blur inputs

---

## 🌐 Live Demo & Deployment

This project is deployed directly on GitHub Pages at:
👉 **[https://mengalpratik.github.io/SpotifyClone/](https://mengalpratik.github.io/SpotifyClone/)**

Any changes pushed to `main` automatically trigger the GitHub Actions workflow in `.github/workflows/static.yml` and publish immediately to production.

---

## 🚀 Local Development

No Node.js or backend server build steps required. Simply run a local HTTP server:

### Using Python:
```bash
python3 -m http.server 3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser!

### Using Node / npx:
```bash
npx serve .
```

---

## 📂 Project Structure

```
Spotify/
├── index.html          # Main Spotify Web Player interface
├── favicon.ico         # Spotify favicon
├── css/
│   ├── style.css       # Complete modern Spotify desktop styles
│   └── utility.css     # CSS variables, animations, scrollbars
├── js/
│   └── script.js       # MusicAPI, Player engine, Visualizer & UI state
├── img/                # SVG icons and covers
│   ├── logo.svg
│   ├── cover.jpg
│   └── ...
└── README.md           # Project documentation
```

---

## 📜 License

Created with passion for music and high-performance web engineering. Open source and free to use!
