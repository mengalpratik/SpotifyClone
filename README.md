# 🎵 Spotify Web Player 2.0 (Pro Edition)

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-1ed760?style=for-the-badge&logo=spotify&logoColor=black)](https://mengalpratik.github.io/SpotifyClone/)
[![Deployment Status](https://img.shields.io/github/actions/workflow/status/mengalpratik/SpotifyClone/static.yml?branch=main&style=for-the-badge&label=GitHub%20Pages)](https://mengalpratik.github.io/SpotifyClone/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/pratikmengal)
[![UPI](https://img.shields.io/badge/UPI-iampratikmengal--2%40okaxis-4285F4?style=for-the-badge&logo=google-pay&logoColor=white)](upi://pay?pa=iampratikmengal-2@okaxis&pn=Pratik%20Mengal&cu=INR)

A modern, high-fidelity **Spotify Web Player** built with vanilla ES6+ JavaScript, CSS3 Glassmorphism, and HTML5 Web Audio API. Powered by **real, free-to-use music catalog APIs** with zero API key configuration needed out of the box, bringing instant playback of 100M+ songs to life!

👉 **[Launch Live Web Player](https://mengalpratik.github.io/SpotifyClone/)**

![Spotify Web Player 2.0](img/cover.jpg)

---

## ✨ Features

- 📱 **100% Responsive Across All Devices**:
  - **Mobile Phones (320px - 480px)**: Dedicated **Mobile Bottom Navigation Bar**, docked **Mobile Mini-Player**, and full-screen **Mobile Player Sheet** with gesture drag scrubbing, big controls, and album art.
  - **Tablets & Phablets (481px - 1024px)**: Fluid card grids, adaptive sidebars, and optimized track tables.
  - **Desktop & Ultra-wide**: Full obsidian dark Spotify desktop workspace with docked bottom playbar, real-time audio visualizer, and slide-over queue drawer.
- 🔑 **Enhanced Persistent Song API & Key Manager**:
  - **Apple Music / iTunes Public Catalog (Default)**: 100% Free, zero key required, 100M+ songs worldwide with instant audio streams.
  - **Audius Decentralized Music Network**: Free decentralized streaming with trending EDM, lofi, hip-hop, and indie artists.
  - **Jamendo Music**: Royalty-free independent tracks with custom developer client ID support.
  - **Custom API / Audio Proxy**: Connect your own custom song search & streaming endpoint with optional Bearer token.
  - **Live Connection Latency Test**: Interactive ping button measuring round-trip API speed in real time.
  - **Full Persistence**: Selected provider and custom keys are preserved in `localStorage` across reloads.
- 🎨 **Next-Gen Spotify Desktop UI & Glassmorphism**:
  - Obsidian Dark theme (`#0b0b0b`) with authentic Spotify Green accents (`#1ed760`).
  - **Dynamic Ambient Glow**: Breathing radial light that dynamically adapts its color aura to match the currently playing song's vibe and genre.
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
  - Mobile-responsive table automatically hides secondary columns to prevent horizontal overflow.
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
├── index.html          # Main Spotify Web Player interface (Desktop & Mobile)
├── favicon.ico         # Spotify favicon
├── css/
│   ├── style.css       # Complete modern Spotify desktop & mobile styles
│   └── utility.css     # CSS variables, animations, scrollbars, toast
├── js/
│   └── script.js       # MusicAPI, Player engine, Visualizer & UI state
├── img/                # SVG icons and covers
│   ├── logo.svg
│   ├── cover.jpg
│   └── ...
└── README.md           # Project documentation
```

---

## ☕ Support & Sponsorship

If you enjoy streaming music with this web player and find this project inspiring, consider buying me a coffee or donating via UPI:

<a href="https://buymeacoffee.com/pratikmengal" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="44" width="185">
</a>
&nbsp;&nbsp;
<a href="upi://pay?pa=iampratikmengal-2@okaxis&pn=Pratik%20Mengal&cu=INR">
  <img src="https://img.shields.io/badge/UPI-iampratikmengal--2%40okaxis-008080?style=for-the-badge&logo=google-pay&logoColor=white" height="42" alt="Pay via UPI" />
</a>

<details>
  <summary><b>🇮🇳 Scan to Pay via UPI (GPay / PhonePe / Paytm / BHIM)</b></summary>
  <br/>
  <img src="https://raw.githubusercontent.com/mengalpratik/mengalpratik/main/assets/upi-qr.png" alt="Pratik Mengal UPI QR Code" width="220" style="border-radius: 12px; border: 1px solid rgba(128,128,128,0.2);" />
  <p><code>iampratikmengal-2@okaxis</code></p>
</details>

---

## 📜 License

Created with passion for music and high-performance web engineering. Open source and free to use!
