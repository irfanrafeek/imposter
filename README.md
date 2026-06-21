# Imposter Music Game

A party web app where everyone hears the same song — except the **imposter**, who hears something different. Players have to figure out who's faking it.

Inspired by Spyfall and Undercover. Multiplayer over Firebase Realtime Database, no backend to run.

## Play locally

Open `index.html` in a browser. You'll see a "Firebase not configured" toast — that means the lobby/multiplayer is disabled until you add a Firebase config (5-minute setup below).

## Multiplayer setup (Firebase)

You need a free Firebase project. The free tier covers a typical party game easily.

### 1. Create a project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → pick any name → disable Analytics (you don't need it) → **Create**

### 2. Enable Realtime Database

1. In the left sidebar, **Build → Realtime Database**
2. Click **Create database**
3. Pick a region close to your players
4. Start in **test mode** (rules below allow anyone to read/write rooms — fine for a party game; tighten later if you want)

### 3. Register a web app

1. **Project settings** (gear icon) → **Your apps** → **Add app** → **Web** (the `</>` icon)
2. Give it a nickname → **Register app**
3. Copy the `firebaseConfig` object Firebase shows you

### 4. Paste into `index.html`

Near the top of the `<script type="module">` block, find:

```js
const FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  databaseURL: "https://REPLACE_ME-default-rtdb.firebaseio.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};
```

Replace with your project's values. Make sure `databaseURL` is included — Firebase's snippet sometimes omits it; the format is `https://<project-id>-default-rtdb.firebaseio.com` (or `<project-id>-default-rtdb.<region>.firebasedatabase.app` for non-US regions; copy whatever's shown on the Realtime Database page).

### 5. Database rules

In **Realtime Database → Rules**, paste:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": true,
        ".write": true,
        ".indexOn": ["joinedAt"]
      }
    }
  }
}
```

Anyone with a room code can read/write that room. Good enough for friends-at-a-party trust level. For anything more public you'd want Firebase Anonymous Auth + a stricter rule scope.

### 6. Host the file

You need to serve `index.html` over HTTPS so phones can reach it. Easiest options:

- **GitHub Pages** — push to a repo, enable Pages on the `main` branch (free, takes 60 seconds)
- **Vercel / Netlify** — drag-and-drop the folder
- **Firebase Hosting** — since you already have a Firebase project: `npm i -g firebase-tools && firebase init hosting && firebase deploy`

## How to play

1. Host taps **Create Game** → sets imposter count → opens the lobby. They get a 4-digit room code.
2. Other players open the same URL, enter the code and a nickname, tap **Join Game**.
3. Everyone taps **I'm Ready**. When everyone's green, the host can **Start**.
4. 3-2-1 countdown, then music plays in sync on every device — except the imposter(s), who hear a different track.
5. Talk it out. Hum a few bars. Watch faces. Try not to give yourself away.
6. Host taps **Reveal Imposter** any time (or when the 60s timer ends). Identity reveal + which tracks each side heard.
7. **Play Again** keeps the lobby open with the same players for another round.

Headphones strongly recommended. Otherwise everyone hears everyone's audio leaking and the trick falls apart.

## Architecture notes

- Single HTML file, no build step. ES modules loaded from the Firebase CDN.
- State lives in `/rooms/{code}` in Realtime Database: `meta` (phase, host, imposters, track index, `startAt` timestamp) and `players/{playerId}` (name, ready).
- Phase transitions drive screen routing client-side. Only the host writes phase changes; others react via `onValue` listener.
- Audio sync uses Firebase's server clock offset — when the host hits Start, they write a `startAt` wall-clock timestamp 4 seconds in the future. Every client schedules the countdown and `audio.play()` against that timestamp, accounting for their local clock drift. Late-joining clients seek to the correct offset.
- Presence cleanup via `onDisconnect().remove()` — close the tab and you disappear from the lobby. If the host leaves, the room is deleted.

## Known limitations

- **Host disconnect kills the room.** No host migration; the remaining players need to start a fresh lobby. Fixable if you want — pick the earliest-joined remaining player and have them write themselves as `meta.hostId`.
- **No voting UI.** Imposter reveal is host-triggered. Adding a vote step would be ~50 lines.
- **No round persistence across refreshes.** Refreshing your browser drops you out of the lobby. The room code stays valid; just rejoin.

## Music

Songs come from Apple's iTunes Search API — free, no API key, returns 30-second preview MP3s of essentially the whole iTunes catalog. Rounds are 30 seconds to match.

Categories live in `CATEGORIES` at the top of `index.html`. Each entry is a search query string (`"track artist"`). To add a song, drop a new line into the right list. To add a new category, add a new key. The app picks two random songs from the chosen category at the start of each round.

A small share of songs (~5%) don't have previews available because of label deals — the picker retries automatically if it hits one.
