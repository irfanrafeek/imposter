import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, set, get, update, onValue, onDisconnect, serverTimestamp, remove, increment, push
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

(() => {
  'use strict';

  // ============================================================
  // FIREBASE CONFIG
  // Replace with your project's config. See README.md for setup.
  // ============================================================
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDhDgQlJX8nM4IsGdEYNItHzZ2LjbIDIH0",
    authDomain: "imposter-20b85.firebaseapp.com",
    databaseURL: "https://imposter-20b85-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "imposter-20b85",
    storageBucket: "imposter-20b85.firebasestorage.app",
    messagingSenderId: "689271207746",
    appId: "1:689271207746:web:762f2f40b378e3a6d27adb",
  };
  const FB_CONFIGURED = !FIREBASE_CONFIG.apiKey.includes("REPLACE_ME");

  // ============================================================
  // CONFIG
  // ============================================================
  const COUNTDOWN_MS = 4000;
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 20;
  const DEFAULT_CATEGORY = 'Food';
  // Identifies this game inside shared infrastructure (analytics, and the
  // multi-game hub). Each game gets its own namespace, e.g.
  // analytics/word/... so games never collide.
  const GAME = 'word';
  // Canonical public URL of THIS game for shareable links (QR codes, deep
  // links). Hardcoded — NOT location.origin — so that when this same code
  // runs inside the native app (Capacitor WebView, origin https://localhost)
  // the QR a host generates still points friends at the real website.
  const SHARE_BASE = 'https://impostorgames.com/word';
  // A room with no deliberate activity for this long is considered dead:
  // the idle watchdog closes it, and createRoom will recycle its code.
  const IDLE_MS = 15 * 60 * 1000; // 15 minutes

  // Word lists per category. Each entry: `w` is the secret word every
  // crewmate sees; `h` is the vague hint shown only to the imposter —
  // helpful enough to bluff with, never enough to pinpoint the word.
  const WORD_CATEGORIES = {
    'Food': [
      { w: 'Pizza', h: 'Cheesy' },
      { w: 'Burger', h: 'Stacked' },
      { w: 'Sushi', h: 'Delicate' },
      { w: 'Pasta', h: 'Italian' },
      { w: 'Ice Cream', h: 'Cold' },
      { w: 'Chocolate', h: 'Addictive' },
      { w: 'Pancake', h: 'Flat' },
      { w: 'Taco', h: 'Folded' },
      { w: 'Biryani', h: 'Fragrant' },
      { w: 'Noodles', h: 'Long' },
      { w: 'Sandwich', h: 'Layered' },
      { w: 'French Fries', h: 'Salty' },
      { w: 'Donut', h: 'Round' },
      { w: 'Cheese', h: 'Melted' },
      { w: 'Popcorn', h: 'Buttery' },
      { w: 'Salad', h: 'Fresh' },
      { w: 'Soup', h: 'Hot' },
      { w: 'Steak', h: 'Juicy' },
      { w: 'Fried Chicken', h: 'Crispy' },
      { w: 'Dumplings', h: 'Steamed' },
      { w: 'Curry', h: 'Spicy' },
      { w: 'Bread', h: 'Baked' },
      { w: 'Butter', h: 'Smooth' },
      { w: 'Honey', h: 'Golden' },
      { w: 'Omelette', h: 'Fluffy' },
      { w: 'Cereal', h: 'Crunchy' },
      { w: 'Yogurt', h: 'Creamy' },
      { w: 'Mango', h: 'Tropical' },
      { w: 'Banana', h: 'Yellow' },
      { w: 'Apple', h: 'Red' },
      { w: 'Watermelon', h: 'Refreshing' },
      { w: 'Strawberry', h: 'Sweet' },
      { w: 'Coconut', h: 'White' },
      { w: 'Lemon', h: 'Sour' },
      { w: 'Grapes', h: 'Tiny' },
      { w: 'Pineapple', h: 'Controversial' },
      { w: 'Orange Juice', h: 'Squeezed' },
      { w: 'Coffee', h: 'Bitter' },
      { w: 'Tea', h: 'Brewed' },
      { w: 'Milkshake', h: 'Frothy' },
      { w: 'Cake', h: 'Frosted' },
      { w: 'Cookie', h: 'Chewy' },
      { w: 'Brownie', h: 'Dense' },
      { w: 'Waffle', h: 'Square' },
      { w: 'Hot Dog', h: 'Quick' },
      { w: 'Spring Roll', h: 'Rolled' },
      { w: 'Samosa', h: 'Stuffed' },
      { w: 'Kebab', h: 'Charred' },
      { w: 'Shawarma', h: 'Wrapped' },
      { w: 'Ramen', h: 'Soupy' },
    ],
    'Animals': [
      { w: 'Dog', h: 'Loyal' },
      { w: 'Cat', h: 'Aloof' },
      { w: 'Elephant', h: 'Enormous' },
      { w: 'Lion', h: 'Fierce' },
      { w: 'Tiger', h: 'Striped' },
      { w: 'Giraffe', h: 'Tall' },
      { w: 'Zebra', h: 'Two-toned' },
      { w: 'Monkey', h: 'Playful' },
      { w: 'Gorilla', h: 'Muscular' },
      { w: 'Panda', h: 'Cuddly' },
      { w: 'Kangaroo', h: 'Bouncy' },
      { w: 'Koala', h: 'Sleepy' },
      { w: 'Bear', h: 'Burly' },
      { w: 'Wolf', h: 'Wild' },
      { w: 'Fox', h: 'Cunning' },
      { w: 'Rabbit', h: 'Fast' },
      { w: 'Deer', h: 'Graceful' },
      { w: 'Horse', h: 'Strong' },
      { w: 'Cow', h: 'Gentle' },
      { w: 'Goat', h: 'Stubborn' },
      { w: 'Sheep', h: 'Fluffy' },
      { w: 'Pig', h: 'Muddy' },
      { w: 'Chicken', h: 'Feathered' },
      { w: 'Duck', h: 'Floating' },
      { w: 'Owl', h: 'Nocturnal' },
      { w: 'Eagle', h: 'Soaring' },
      { w: 'Parrot', h: 'Colorful' },
      { w: 'Penguin', h: 'Clumsy' },
      { w: 'Peacock', h: 'Showy' },
      { w: 'Flamingo', h: 'Pink' },
      { w: 'Snake', h: 'Slippery' },
      { w: 'Crocodile', h: 'Scaly' },
      { w: 'Turtle', h: 'Slow' },
      { w: 'Frog', h: 'Jumpy' },
      { w: 'Shark', h: 'Toothy' },
      { w: 'Dolphin', h: 'Smart' },
      { w: 'Whale', h: 'Massive' },
      { w: 'Octopus', h: 'Flexible' },
      { w: 'Jellyfish', h: 'Squishy' },
      { w: 'Crab', h: 'Shelled' },
      { w: 'Butterfly', h: 'Fluttering' },
      { w: 'Bee', h: 'Buzzing' },
      { w: 'Ant', h: 'Tireless' },
      { w: 'Spider', h: 'Creepy' },
      { w: 'Mosquito', h: 'Persistent' },
      { w: 'Camel', h: 'Enduring' },
      { w: 'Donkey', h: 'Humble' },
      { w: 'Squirrel', h: 'Twitchy' },
      { w: 'Bat', h: 'Winged' },
      { w: 'Hippo', h: 'Hefty' },
    ],
    'Places': [
      { w: 'Beach', h: 'Sunny' },
      { w: 'Airport', h: 'Busy' },
      { w: 'Hospital', h: 'Sterile' },
      { w: 'School', h: 'Structured' },
      { w: 'Library', h: 'Hushed' },
      { w: 'Cinema', h: 'Dim' },
      { w: 'Gym', h: 'Energetic' },
      { w: 'Supermarket', h: 'Stocked' },
      { w: 'Restaurant', h: 'Reserved' },
      { w: 'Hotel', h: 'Welcoming' },
      { w: 'Museum', h: 'Historic' },
      { w: 'Zoo', h: 'Caged' },
      { w: 'Amusement Park', h: 'Thrilling' },
      { w: 'Swimming Pool', h: 'Wet' },
      { w: 'Barbershop', h: 'Chatty' },
      { w: 'Bank', h: 'Secure' },
      { w: 'Church', h: 'Solemn' },
      { w: 'Temple', h: 'Spiritual' },
      { w: 'Mosque', h: 'Sacred' },
      { w: 'Castle', h: 'Ancient' },
      { w: 'Desert', h: 'Barren' },
      { w: 'Jungle', h: 'Dense' },
      { w: 'Mountain', h: 'Steep' },
      { w: 'Waterfall', h: 'Roaring' },
      { w: 'Island', h: 'Remote' },
      { w: 'Cave', h: 'Echoing' },
      { w: 'Farm', h: 'Rustic' },
      { w: 'Stadium', h: 'Packed' },
      { w: 'Casino', h: 'Risky' },
      { w: 'Nightclub', h: 'Flashy' },
      { w: 'Office', h: 'Routine' },
      { w: 'Prison', h: 'Confined' },
      { w: 'Police Station', h: 'Orderly' },
      { w: 'Fire Station', h: 'Alert' },
      { w: 'Train Station', h: 'Rushed' },
      { w: 'Bus Stop', h: 'Patient' },
      { w: 'Gas Station', h: 'Convenient' },
      { w: 'Bakery', h: 'Aromatic' },
      { w: 'Pharmacy', h: 'Helpful' },
      { w: 'Playground', h: 'Cheerful' },
      { w: 'University', h: 'Ambitious' },
      { w: 'Court', h: 'Formal' },
      { w: 'Space Station', h: 'Isolated' },
      { w: 'Lighthouse', h: 'Solitary' },
      { w: 'Harbor', h: 'Breezy' },
      { w: 'Bridge', h: 'Connecting' },
      { w: 'Market', h: 'Noisy' },
      { w: 'Graveyard', h: 'Somber' },
      { w: 'Aquarium', h: 'Watery' },
      { w: 'Circus', h: 'Theatrical' },
    ],
    'Everyday Objects': [
      { w: 'Umbrella', h: 'Foldable' },
      { w: 'Mirror', h: 'Reflective' },
      { w: 'Ladder', h: 'Leaning' },
      { w: 'Scissors', h: 'Sharp' },
      { w: 'Toothbrush', h: 'Bristly' },
      { w: 'Pillow', h: 'Soft' },
      { w: 'Blanket', h: 'Warm' },
      { w: 'Spoon', h: 'Curved' },
      { w: 'Fork', h: 'Pointy' },
      { w: 'Knife', h: 'Dangerous' },
      { w: 'Plate', h: 'Fragile' },
      { w: 'Cup', h: 'Ceramic' },
      { w: 'Bottle', h: 'Capped' },
      { w: 'Backpack', h: 'Zipped' },
      { w: 'Wallet', h: 'Pocket-sized' },
      { w: 'Keys', h: 'Metallic' },
      { w: 'Sunglasses', h: 'Tinted' },
      { w: 'Watch', h: 'Ticking' },
      { w: 'Ring', h: 'Shiny' },
      { w: 'Comb', h: 'Toothed' },
      { w: 'Soap', h: 'Foamy' },
      { w: 'Towel', h: 'Absorbent' },
      { w: 'Shampoo', h: 'Liquid' },
      { w: 'Candle', h: 'Flickering' },
      { w: 'Matchbox', h: 'Fiery' },
      { w: 'Flashlight', h: 'Bright' },
      { w: 'Battery', h: 'Rechargeable' },
      { w: 'Charger', h: 'Plugged' },
      { w: 'Headphones', h: 'Padded' },
      { w: 'Television', h: 'Glowing' },
      { w: 'Remote Control', h: 'Buttoned' },
      { w: 'Refrigerator', h: 'Humming' },
      { w: 'Washing Machine', h: 'Spinning' },
      { w: 'Microwave', h: 'Beeping' },
      { w: 'Fan', h: 'Whirring' },
      { w: 'Air Conditioner', h: 'Cooling' },
      { w: 'Clock', h: 'Circular' },
      { w: 'Calendar', h: 'Dated' },
      { w: 'Pen', h: 'Clicky' },
      { w: 'Pencil', h: 'Wooden' },
      { w: 'Eraser', h: 'Rubbery' },
      { w: 'Notebook', h: 'Lined' },
      { w: 'Chair', h: 'Sturdy' },
      { w: 'Table', h: 'Flat' },
      { w: 'Bed', h: 'Comfortable' },
      { w: 'Sofa', h: 'Cushioned' },
      { w: 'Door', h: 'Hinged' },
      { w: 'Window', h: 'Glassy' },
      { w: 'Broom', h: 'Long-handled' },
      { w: 'Bucket', h: 'Hollow' },
    ],
    'Movies & TV': [
      { w: 'Titanic', h: 'Tragic' },
      { w: 'Avatar', h: 'Blue' },
      { w: 'Avengers', h: 'Ensemble' },
      { w: 'Spider-Man', h: 'Youthful' },
      { w: 'Batman', h: 'Brooding' },
      { w: 'Superman', h: 'Classic' },
      { w: 'Harry Potter', h: 'Magical' },
      { w: 'Lord of the Rings', h: 'Epic' },
      { w: 'Star Wars', h: 'Galactic' },
      { w: 'Jurassic Park', h: 'Roaring' },
      { w: 'Frozen', h: 'Musical' },
      { w: 'The Lion King', h: 'Majestic' },
      { w: 'Toy Story', h: 'Nostalgic' },
      { w: 'Shrek', h: 'Irreverent' },
      { w: 'Finding Nemo', h: 'Oceanic' },
      { w: 'Minions', h: 'Mischievous' },
      { w: 'Inception', h: 'Mind-bending' },
      { w: 'The Matrix', h: 'Futuristic' },
      { w: 'Terminator', h: 'Relentless' },
      { w: 'Mission Impossible', h: 'Daring' },
      { w: 'James Bond', h: 'Suave' },
      { w: 'Fast and Furious', h: 'Reckless' },
      { w: 'John Wick', h: 'Vengeful' },
      { w: 'Joker', h: 'Chaotic' },
      { w: 'Deadpool', h: 'Sarcastic' },
      { w: 'Black Panther', h: 'Regal' },
      { w: 'Iron Man', h: 'Inventive' },
      { w: 'Wonder Woman', h: 'Heroic' },
      { w: 'Pirates of the Caribbean', h: 'Adventurous' },
      { w: 'King Kong', h: 'Gigantic' },
      { w: 'Godzilla', h: 'Destructive' },
      { w: 'Home Alone', h: 'Festive' },
      { w: 'Mr. Bean', h: 'Silent' },
      { w: 'Friends', h: 'Beloved' },
      { w: 'The Office', h: 'Deadpan' },
      { w: 'Game of Thrones', h: 'Ruthless' },
      { w: 'Breaking Bad', h: 'Intense' },
      { w: 'Stranger Things', h: 'Mysterious' },
      { w: 'Squid Game', h: 'Deadly' },
      { w: 'Money Heist', h: 'Calculated' },
      { w: 'Sherlock', h: 'Observant' },
      { w: 'The Simpsons', h: 'Satirical' },
      { w: 'Tom and Jerry', h: 'Slapstick' },
      { w: 'SpongeBob', h: 'Quirky' },
      { w: 'Doraemon', h: 'Whimsical' },
      { w: 'Pokemon', h: 'Collectible' },
      { w: 'Naruto', h: 'Determined' },
      { w: 'Interstellar', h: 'Cosmic' },
      { w: 'Gladiator', h: 'Brutal' },
      { w: 'E.T.', h: 'Heartwarming' },
    ],
    'Football': [
      { w: 'Messi', h: 'Magical' },
      { w: 'Ronaldo', h: 'Driven' },
      { w: 'Neymar', h: 'Flashy' },
      { w: 'Mbappe', h: 'Lightning' },
      { w: 'Haaland', h: 'Towering' },
      { w: 'Maradona', h: 'Legendary' },
      { w: 'Pele', h: 'Pioneering' },
      { w: 'Zidane', h: 'Masterful' },
      { w: 'Ronaldinho', h: 'Joyful' },
      { w: 'Beckham', h: 'Stylish' },
      { w: 'Salah', h: 'Electric' },
      { w: 'Suarez', h: 'Controversial' },
      { w: 'Lewandowski', h: 'Prolific' },
      { w: 'Modric', h: 'Tireless' },
      { w: 'Kaka', h: 'Elegant' },
      { w: 'Ibrahimovic', h: 'Fearless' },
      { w: 'Real Madrid', h: 'Prestigious' },
      { w: 'Barcelona', h: 'Artistic' },
      { w: 'Manchester United', h: 'Storied' },
      { w: 'Liverpool', h: 'Spirited' },
      { w: 'Chelsea', h: 'Wealthy' },
      { w: 'Arsenal', h: 'Hopeful' },
      { w: 'Manchester City', h: 'Dominant' },
      { w: 'Bayern Munich', h: 'Consistent' },
      { w: 'PSG', h: 'Glamorous' },
      { w: 'Juventus', h: 'Disciplined' },
      { w: 'AC Milan', h: 'Proud' },
      { w: 'Inter Milan', h: 'Resilient' },
      { w: 'World Cup', h: 'Global' },
      { w: 'Champions League', h: 'Elite' },
      { w: 'Premier League', h: 'Competitive' },
      { w: 'La Liga', h: 'Technical' },
      { w: 'Penalty', h: 'Nerve-wracking' },
      { w: 'Free Kick', h: 'Curled' },
      { w: 'Corner Kick', h: 'Aerial' },
      { w: 'Offside', h: 'Marginal' },
      { w: 'Red Card', h: 'Harsh' },
      { w: 'Yellow Card', h: 'Cautionary' },
      { w: 'Goalkeeper', h: 'Lonely' },
      { w: 'Striker', h: 'Clinical' },
      { w: 'Defender', h: 'Rugged' },
      { w: 'Midfielder', h: 'Versatile' },
      { w: 'Hat-trick', h: 'Triple' },
      { w: 'Own Goal', h: 'Embarrassing' },
      { w: 'VAR', h: 'Divisive' },
      { w: 'Referee', h: 'Unpopular' },
      { w: 'Derby', h: 'Heated' },
      { w: 'Dribbling', h: 'Dazzling' },
      { w: 'Header', h: 'Airborne' },
      { w: 'Bicycle Kick', h: 'Acrobatic' },
    ],
  };

  // Grouped metadata for the category picker. Order here drives the
  // modal sheet layout; add a new entry under the right group to surface
  // a new category. Each `name` must match a key in WORD_CATEGORIES above.
  const CATEGORY_GROUPS = [
    {
      label: 'Categories',
      categories: [
        { name: 'Food',             description: 'Dishes, snacks, fruits and drinks' },
        { name: 'Animals',          description: 'Pets, wildlife, birds and sea creatures' },
        { name: 'Places',           description: 'Everywhere from the beach to a space station' },
        { name: 'Everyday Objects', description: 'Things lying around every home' },
        { name: 'Movies & TV',      description: 'Blockbusters, series and cartoon icons' },
        { name: 'Football',         description: 'Stars, clubs and moments from the pitch' },
      ],
    },
  ];

  // Firebase keys can't contain . # $ [ ] /. Words and category names are
  // ASCII-safe today, but sanitize anyway to future-proof.
  function sanitizeKey(s) { return String(s).replace(/[.#$\[\]/]/g, '_'); }

  // The host can pick several categories at once; a round draws from their
  // union. `meta.categories` is the array; older rooms (or a client mid-
  // deploy) may still carry only the single `meta.category`, so fall back to
  // that, then to the default. Names that no longer exist in the catalog are
  // dropped so a stale pick can never empty the pool.
  function activeCategories() {
    const m = state.meta;
    if (m && Array.isArray(m.categories) && m.categories.length) {
      const valid = m.categories.filter(c => WORD_CATEGORIES[c]);
      if (valid.length) return valid;
    }
    if (m && m.category && WORD_CATEGORIES[m.category]) return [m.category];
    return [DEFAULT_CATEGORY];
  }

  // Compact label for the lobby trigger/display: one name, two names, or the
  // first two plus a "+N" count so the card stays lean.
  function categoriesSummary(cats) {
    if (!cats || !cats.length) return DEFAULT_CATEGORY;
    if (cats.length === 1) return cats[0];
    if (cats.length === 2) return cats[0] + ', ' + cats[1];
    return cats[0] + ', ' + cats[1] + ' +' + (cats.length - 2);
  }

  // Pick a word from the union of the selected categories, skipping ones
  // already played in this room. The chosen entry carries its source category
  // so the caller records it under the right played bucket. When every word
  // across the union has been used, `reset` signals the caller to wipe the
  // played buckets and start the selection fresh.
  function pickWord(categoryNames, playedMap) {
    const cats = (categoryNames && categoryNames.length) ? categoryNames : [DEFAULT_CATEGORY];
    const played = playedMap || {};
    const union = [];
    cats.forEach(c => (WORD_CATEGORIES[c] || []).forEach(e => union.push({ e, cat: c })));
    const unplayed = union.filter(({ e, cat }) => !(played[sanitizeKey(cat)] || {})[sanitizeKey(e.w)]);
    const reset = unplayed.length === 0;
    const usePool = reset ? union : unplayed;
    const chosen = usePool[Math.floor(Math.random() * usePool.length)];
    return { entry: chosen.e, cat: chosen.cat, reset };
  }

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    screen: 'home',
    roomCode: null,
    isHost: false,
    myId: null,
    myName: '',
    numImposters: 1,
    players: [],
    meta: null,
    roomUnsub: null,
    presenceUnsub: null,
    myJoinedAt: 0,
    myReady: false,
    imposterIds: [],
    pendingJoinCode: null,
    countdownTimer: null,
    idleTimer: null,
    serverTimeOffset: 0,
  };

  // ============================================================
  // FIREBASE INIT
  // ============================================================
  let db = null;
  if (FB_CONFIGURED) {
    try {
      const app = initializeApp(FIREBASE_CONFIG);
      db = getDatabase(app);
      onValue(ref(db, '.info/serverTimeOffset'), snap => {
        state.serverTimeOffset = snap.val() || 0;
      });
    } catch (e) {
      console.error('Firebase init failed:', e);
    }
  }

  function nowSync() { return Date.now() + state.serverTimeOffset; }

  // ============================================================
  // HELPERS
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rand(a.length)];

  function genRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[rand(chars.length)];
    return s;
  }

  function genId() { return 'p_' + Math.random().toString(36).slice(2, 9); }

  function avatarClass(name) {
    const colors = ['avatar-c1','avatar-c2','avatar-c3','avatar-c4','avatar-c5','avatar-c6','avatar-c7','avatar-c8'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return colors[h % colors.length];
  }

  // Animal avatars: each player gets a random unused animal (1..20) at
  // join time, stored on their player record so every phone shows the same
  // animal. Players from rooms created before this shipped have no `av`
  // and fall back to the old initials circle.
  const AVATAR_COUNT = 20;
  const AVATAR_NAMES = ['fox','panda','koala','dog','rabbit','bear','lion','tiger','raccoon','penguin','deer','giraffe','elephant','cow','hedgehog','owl','otter','shiba','frog','chick'];
  function pickAvatar(playersObj) {
    const used = new Set(Object.values(playersObj || {}).map(p => p && p.av).filter(Boolean));
    const free = [];
    for (let i = 1; i <= AVATAR_COUNT; i++) if (!used.has(i)) free.push(i);
    const pool = free.length ? free : Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function avatarHtml(p) {
    if (p.av >= 1 && p.av <= AVATAR_COUNT) {
      const animal = AVATAR_NAMES[p.av - 1];
      return `<img class="player-avatar" src="/avatars/av${String(p.av).padStart(2, '0')}.webp" alt="${animal}">`;
    }
    return `<div class="player-avatar ${avatarClass(p.name)}">${escapeHtml(p.name.slice(0, 2).toUpperCase())}</div>`;
  }

  // Player id → timestamp of its first lobby render. A join triggers several
  // RTDB snapshots back-to-back (player write + lastActivity stamp), each
  // re-building the list — so the just-joined class must survive re-renders
  // for the animation's duration, not just the very first paint.
  const lobbySeen = new Map();
  const JOIN_ANIM_MS = 700;
  function isNewInLobby(id) {
    const now = Date.now();
    if (!lobbySeen.has(id)) lobbySeen.set(id, now);
    return now - lobbySeen.get(id) < JOIN_ANIM_MS;
  }

  // Confetti micro-burst: fired once per player (guarded by burstFired) and
  // skipped on the initial lobby paint so a late joiner doesn't see a salvo
  // of bursts for everyone already in the room.
  const burstFired = new Set();
  function confettiBurst(rowEl) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Measure the row, not the avatar — the avatar's pop animation starts at
    // scale(0), so its rect is 0x0 at this moment. The avatar sits 16px
    // (row padding) + 20px (half its 40px width) from the row's left edge.
    const r = rowEl.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + 36, cy = r.top + r.height / 2;
    const colors = ['#f2a65e', '#e8875f', '#2f9e94', '#e9c46a', '#9b8ec4', '#e58ba2'];
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('span');
      s.className = 'confetti-bit';
      const ang = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.6;
      const dist = 26 + Math.random() * 22;
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.background = colors[i % colors.length];
      if (i % 3 === 0) { s.style.width = '6px'; s.style.height = '6px'; s.style.borderRadius = '50%'; }
      s.style.setProperty('--dx', (Math.cos(ang) * dist) + 'px');
      s.style.setProperty('--dy', (Math.sin(ang) * dist + 14) + 'px');
      s.style.setProperty('--rot', (Math.random() * 240 - 120) + 'deg');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 700);
    }
  }

  // Smooth departures: clone the leaving row as a fixed ghost on <body> (the
  // same trick the confetti uses) so it can fade out after the rebuild has
  // already dropped the real row, instead of just blinking away.
  function spawnLeaveGhost(rowEl, rect) {
    const ghost = rowEl.cloneNode(true);
    ghost.classList.remove('just-joined');
    ghost.classList.add('player-ghost');
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    document.body.appendChild(ghost);
    setTimeout(() => ghost.remove(), 500);
  }

  // FLIP: rows that survived the rebuild (matched by data-pid) are snapped
  // back to their old position, then released so they glide to the new one.
  function flipRows(list, firstRects) {
    [...list.children].forEach(row => {
      const first = firstRects.get(row.dataset.pid);
      if (!first || row.classList.contains('just-joined')) return;
      const dy = first.top - row.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      row.style.transition = 'none';
      row.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        row.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
        row.style.transform = '';
      });
      row.addEventListener('transitionend', function clear() {
        row.style.transition = '';
        row.style.transform = '';
        row.removeEventListener('transitionend', clear);
      });
    });
  }

  function showToast(msg, ms = 2200) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function go(screenId) {
    if (screenId !== 'lobby') stopHintRotation();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-' + screenId).classList.add('active');
    state.screen = screenId;
    document.getElementById('app').scrollTop = 0;
  }

  // ============================================================
  // ROOM OPERATIONS (Firebase)
  // ============================================================
  async function createRoom(name, numImposters) {
    if (!db) throw new Error('Firebase not configured');
    let code;
    for (let i = 0; i < 5; i++) {
      code = genRoomCode();
      const snap = await get(ref(db, `rooms-word/${code}/meta`));
      if (!snap.exists()) break;
      // Code is taken — but if that room has gone idle past the cutoff it's
      // abandoned (e.g. everyone closed their tab, so the watchdog never
      // fired). Reclaim the code and overwrite the dead room.
      const m = snap.val();
      const last = (m && (m.lastActivity || m.createdAt)) || 0;
      if (typeof last === 'number' && nowSync() - last > IDLE_MS) break;
    }
    const myId = genId();
    const joinedAt = nowSync();
    const av = pickAvatar(null);
    await set(ref(db, `rooms-word/${code}`), {
      meta: {
        hostId: myId,
        numImposters,
        category: DEFAULT_CATEGORY,
        phase: 'lobby',
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      },
      players: {
        [myId]: { name, ready: false, joinedAt, av }
      }
    });
    state.roomCode = code;
    state.myId = myId;
    state.myName = name;
    state.myAv = av;
    state.myJoinedAt = joinedAt;
    state.myReady = false;
    state.isHost = true;
    state.numImposters = numImposters;

    setupPresence();
    // NOTE: the room listener is attached later, when the host taps
    // "Go to Lobby" (see btn-share-continue). Attaching it here would let
    // the lobby-phase auto-router skip the share-code screen.
  }

  async function joinRoom(code, name) {
    if (!db) throw new Error('Firebase not configured');
    const roomSnap = await get(ref(db, `rooms-word/${code}`));
    if (!roomSnap.exists() || !roomSnap.val().meta) throw new Error('Room not found');
    const room = roomSnap.val();
    const meta = room.meta;
    if (meta.phase !== 'lobby') throw new Error('Game already in progress');
    if (Object.keys(room.players || {}).length >= MAX_PLAYERS) throw new Error('Room is full');

    const myId = genId();
    const joinedAt = nowSync();
    const av = pickAvatar(room.players);
    await set(ref(db, `rooms-word/${code}/players/${myId}`), {
      name, ready: false, joinedAt, av
    });
    update(ref(db, `rooms-word/${code}/meta`), { lastActivity: serverTimestamp() }).catch(()=>{});
    state.roomCode = code;
    state.myId = myId;
    state.myName = name;
    state.myAv = av;
    state.myJoinedAt = joinedAt;
    state.myReady = false;
    state.isHost = false;

    setupPresence();
    attachRoomListener();
  }

  // Firebase presence: re-add the player whenever the connection
  // (re)establishes — screen-off, tab-switch, and network blips all drop
  // the socket and fire onDisconnect, which would otherwise remove us
  // permanently. Watching .info/connected lets us recover automatically.
  function setupPresence() {
    acquireWakeLock();
    if (!db || !state.roomCode || !state.myId) return;
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
    const connectedRef = ref(db, '.info/connected');
    state.presenceUnsub = onValue(connectedRef, (snap) => {
      if (snap.val() === true) refreshPresence();
    });
  }

  async function refreshPresence() {
    if (!db || !state.roomCode || !state.myId) return;
    const code = state.roomCode, id = state.myId;
    try {
      // Don't resurrect a room the host has already closed.
      const metaSnap = await get(ref(db, `rooms-word/${code}/meta`));
      if (!metaSnap.exists()) return;
      if (state.roomCode !== code || state.myId !== id) return;
      const myRef = ref(db, `rooms-word/${code}/players/${id}`);
      await onDisconnect(myRef).remove();
      await set(myRef, {
        name: state.myName,
        ready: !!state.myReady,
        joinedAt: state.myJoinedAt || nowSync(),
        av: state.myAv || 0,
      });
    } catch (e) { /* transient — will retry on next reconnect */ }
  }

  // Screen Wake Lock: keep the phone awake while in a room so it doesn't
  // lock, drop the socket, and bump the player. Supported on Chrome/Android
  // and iOS Safari 16.4+. Where it's unavailable or denied, a rotating hint
  // in the lobby asks the player to keep their screen on instead.
  const WAKE_SUPPORTED = ('wakeLock' in navigator);
  let wakeLock = null;
  let wakeDenied = false;
  async function acquireWakeLock() {
    if (!WAKE_SUPPORTED || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeDenied = false;
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) {
      wakeLock = null;
      wakeDenied = true; // fall back to the rotating lobby hint
    }
    if (state.screen === 'lobby') updateLobbyHint();
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }

  // Lobby "keep screen on" hint. Only shown where wake lock can't do the job.
  // It time-shares the single start-hint line so the footer never grows.
  const WAKE_TIP = 'Keep your screen on to stay in the game.';
  let lobbyHintStatus = '';   // the live status text ("Waiting for host…")
  let hintTipVisible = false; // is the tip currently on screen?
  let hintTimer = null;
  function setLobbyStatus(text) {
    lobbyHintStatus = text;
    if (!hintTipVisible) $('start-hint').textContent = text;
  }
  function hintShouldRotate() {
    return (!WAKE_SUPPORTED || wakeDenied) && state.screen === 'lobby';
  }
  function fadeHintTo(text) {
    const el = $('start-hint');
    el.style.transition = 'opacity 0.25s ease';
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = text; el.style.opacity = '1'; }, 250);
  }
  function scheduleHintFlip() {
    const delay = hintTipVisible ? 4000 : 6000; // status 6s, tip 4s
    hintTimer = setTimeout(() => {
      hintTipVisible = !hintTipVisible;
      fadeHintTo(hintTipVisible ? WAKE_TIP : lobbyHintStatus);
      scheduleHintFlip();
    }, delay);
  }
  function updateLobbyHint() {
    if (hintShouldRotate()) {
      if (!hintTimer) scheduleHintFlip();
    } else {
      stopHintRotation();
    }
  }
  function stopHintRotation() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    if (hintTipVisible) {
      hintTipVisible = false;
      const el = $('start-hint');
      el.style.opacity = '1';
      el.textContent = lobbyHintStatus;
    }
  }

  // Stamp the room as active so the idle watchdog leaves it alone.
  function touchRoom() {
    if (!db || !state.roomCode) return;
    update(ref(db, `rooms-word/${state.roomCode}/meta`), { lastActivity: serverTimestamp() }).catch(()=>{});
  }

  // While we're in a room, poll for inactivity. If nothing has happened for
  // IDLE_MS, close the room for everyone — the onValue null-handler below
  // then routes each client home. Any client may do the delete (idempotent).
  function startIdleWatch() {
    stopIdleWatch();
    state.idleTimer = setInterval(async () => {
      if (!db || !state.roomCode || !state.meta) return;
      const last = state.meta.lastActivity;
      if (typeof last !== 'number') return;       // serverTimestamp not resolved yet
      if (nowSync() - last < IDLE_MS) return;
      try { await remove(ref(db, `rooms-word/${state.roomCode}`)); } catch (e) {}
    }, 60000);
  }
  function stopIdleWatch() {
    if (state.idleTimer) { clearInterval(state.idleTimer); state.idleTimer = null; }
  }

  function attachRoomListener() {
    startIdleWatch();
    const roomRef = ref(db, `rooms-word/${state.roomCode}`);
    state.roomUnsub = onValue(roomRef, snap => {
      const data = snap.val();
      if (!data) {
        showToast('Room closed');
        leaveRoom(true);
        return;
      }
      const meta = data.meta || {};
      const playersObj = data.players || {};
      const players = Object.entries(playersObj).map(([id, p]) => ({
        id,
        name: p.name,
        ready: !!p.ready,
        joinedAt: p.joinedAt || 0,
        av: p.av || 0,
        isHost: id === meta.hostId,
        isImposter: meta.imposterIds ? !!meta.imposterIds[id] : false,
        isMe: id === state.myId,
        isBot: false,
      })).sort((a, b) => a.joinedAt - b.joinedAt);

      const prevPhase = state.meta ? state.meta.phase : null;
      state.meta = meta;
      state.players = players;
      state.numImposters = meta.numImposters || 1;
      state.isHost = meta.hostId === state.myId;
      const meNow = players.find(p => p.isMe);
      if (meNow) state.myReady = meNow.ready;

      if (state.screen === 'lobby') renderLobby();
      const phase = meta.phase;
      if (phase !== prevPhase) {
        if (phase === 'lobby' && state.screen !== 'lobby') enterLobby();
        else if ((phase === 'countdown' || phase === 'playing') && state.screen !== 'game') beginGame();
        else if (phase === 'over' && state.screen !== 'over') revealImposter();
      }
    });
  }

  async function fbToggleReady() {
    if (!db || !state.roomCode) return;
    const me = state.players.find(p => p.isMe);
    if (!me) return;
    await update(ref(db, `rooms-word/${state.roomCode}/players/${state.myId}`), {
      ready: !me.ready
    });
    touchRoom();
  }

  async function fbStartGame() {
    if (!db || !state.isHost) return;
    const startBtn = $('btn-start');
    const startHint = $('start-hint');
    startBtn.disabled = true;
    const prevHint = startHint.textContent;
    startHint.textContent = 'Dealing cards…';
    try {
      const cats = activeCategories();
      const playedMap = (state.meta && state.meta.played) || {};
      const picked = pickWord(cats, playedMap);
      const entry = picked.entry;
      const chosenCat = sanitizeKey(picked.cat);

      const shuffled = [...state.players].sort(() => Math.random() - 0.5);
      const imposters = shuffled.slice(0, state.numImposters);
      const imposterIds = {};
      imposters.forEach(p => { imposterIds[p.id] = true; });

      const startAt = nowSync() + COUNTDOWN_MS;

      const wKey = sanitizeKey(entry.w);
      const updates = {
        'meta/phase': 'countdown',
        'meta/startAt': startAt,
        'meta/imposterIds': imposterIds,
        'meta/secretWord': entry.w,
        'meta/imposterHint': entry.h,
        'meta/lastActivity': serverTimestamp(),
      };
      if (picked.reset) {
        // Union exhausted — wipe the played buckets for every selected
        // category, then seed just this word under its own bucket.
        cats.forEach(c => { updates[`meta/played/${sanitizeKey(c)}`] = null; });
        updates[`meta/played/${chosenCat}`] = { [wKey]: true };
      } else {
        updates[`meta/played/${chosenCat}/${wKey}`] = true;
      }
      await update(ref(db, `rooms-word/${state.roomCode}`), updates);

      trackRound(picked.cat, entry.w);

      setTimeout(() => {
        update(ref(db, `rooms-word/${state.roomCode}/meta`), { phase: 'playing' }).catch(()=>{});
      }, Math.max(0, startAt - nowSync()) + 200);
    } catch (e) {
      trackError('round_start_failed');
      showToast(e.message || 'Could not start the round');
      startBtn.disabled = false;
      startHint.textContent = prevHint;
    }
  }

  // Host ends the round: everyone's screen flips to the reveal. All the
  // clue-giving and accusations happen out loud — the app only referees
  // the cards and the reveal.
  async function fbForceReveal() {
    if (!db || !state.isHost) return;
    await update(ref(db, `rooms-word/${state.roomCode}/meta`), { phase: 'over', lastActivity: serverTimestamp() });
  }

  async function fbReplay() {
    if (!db || !state.isHost) return;
    // Ready state persists across rounds — players opt in once at the
    // start of the session and manually toggle off if they need to step
    // away. Only fresh joins default to unready.
    const updates = {};
    updates['meta/phase'] = 'lobby';
    updates['meta/startAt'] = null;
    updates['meta/imposterIds'] = null;
    updates['meta/secretWord'] = null;
    updates['meta/imposterHint'] = null;
    updates['meta/lastActivity'] = serverTimestamp();
    await update(ref(db, `rooms-word/${state.roomCode}`), updates);
  }

  async function leaveRoom(skipDelete) {
    stopHintRotation();
    releaseWakeLock();
    stopAllTimers();
    closeFbPopup(false);

    if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
    // Cancel the pending auto-removal so it can't fire after we've left.
    if (db && state.roomCode && state.myId) {
      try { onDisconnect(ref(db, `rooms-word/${state.roomCode}/players/${state.myId}`)).cancel(); } catch(e){}
    }

    if (db && state.roomCode && state.myId && !skipDelete) {
      try {
        if (state.isHost) {
          await remove(ref(db, `rooms-word/${state.roomCode}`));
        } else {
          await remove(ref(db, `rooms-word/${state.roomCode}/players/${state.myId}`));
        }
      } catch (e) { console.warn('leaveRoom cleanup failed', e); }
    }
    state.roomCode = null;
    state.myId = null;
    state.isHost = false;
    state.players = [];
    state.meta = null;
    lobbySeen.clear();
    burstFired.clear();
    go('home');
  }

  function stopAllTimers() {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
    stopIdleWatch();
  }

  // ============================================================
  // HOME SCREEN
  // ============================================================
  $('howto-scroll').addEventListener('click', () => {
    const target = $('how-to-play');
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  $('btn-create').addEventListener('click', () => {
    if (!FB_CONFIGURED) { go('needs-setup'); return; }
    state.numImposters = 1;
    $('host-name').value = state.myName || '';
    go('setup');
  });

  const codeBoxes = Array.from(document.querySelectorAll('.code-box'));

  function clearCodeBoxes() {
    codeBoxes.forEach(b => { b.value = ''; b.disabled = false; });
    codeBoxes[0].focus();
  }

  function readCode() {
    return codeBoxes.map(b => b.value).join('').toUpperCase();
  }

  async function attemptCodeValidation(code) {
    if (!db) return;
    codeBoxes.forEach(b => b.disabled = true);
    try {
      const roomSnap = await get(ref(db, `rooms-word/${code}`));
      if (!roomSnap.exists() || !roomSnap.val().meta) {
        showToast('No room found with that code');
        clearCodeBoxes();
        return;
      }
      const room = roomSnap.val();
      const meta = room.meta;
      if (meta.phase !== 'lobby') {
        showToast('Game already in progress');
        clearCodeBoxes();
        return;
      }
      if (Object.keys(room.players || {}).length >= MAX_PLAYERS) {
        showToast('Room is full');
        clearCodeBoxes();
        return;
      }
      state.pendingJoinCode = code;
      $('join-name').value = state.myName || '';
      go('join-name');
      setTimeout(() => $('join-name').focus(), 60);
    } catch (e) {
      showToast('Could not check room: ' + (e.message || ''));
      clearCodeBoxes();
    }
  }

  codeBoxes.forEach((box, idx) => {
    box.addEventListener('input', () => {
      let v = box.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      box.value = v;
      // preventScroll: on mobile, auto-advancing focus otherwise makes the
      // browser scroll the newly-focused box into view above the keyboard,
      // which jitters the vertically-centered layout on every keystroke.
      if (v && idx < codeBoxes.length - 1) codeBoxes[idx + 1].focus({ preventScroll: true });
      if (codeBoxes.every(b => b.value)) attemptCodeValidation(readCode());
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        e.preventDefault();
        codeBoxes[idx - 1].focus({ preventScroll: true });
        codeBoxes[idx - 1].value = '';
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        codeBoxes[idx - 1].focus({ preventScroll: true });
      } else if (e.key === 'ArrowRight' && idx < codeBoxes.length - 1) {
        codeBoxes[idx + 1].focus({ preventScroll: true });
      }
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = ((e.clipboardData || window.clipboardData).getData('text') || '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      codeBoxes.forEach((b, i) => { b.value = text[i] || ''; });
      if (text.length === 4) attemptCodeValidation(text);
      else codeBoxes[Math.min(text.length, codeBoxes.length - 1)].focus({ preventScroll: true });
    });
  });

  $('btn-join-home').addEventListener('click', () => {
    if (!FB_CONFIGURED) { go('needs-setup'); return; }
    clearCodeBoxes();
    state.pendingJoinCode = null;
    go('join-code');
    setTimeout(() => codeBoxes[0].focus(), 60);
  });

  $('btn-join').addEventListener('click', async () => {
    if (!FB_CONFIGURED) { go('needs-setup'); return; }
    const code = state.pendingJoinCode;
    const name = $('join-name').value.trim();
    if (!code) { go('join-code'); return; }
    if (!name) { showToast('Choose a nickname'); return; }
    $('btn-join').disabled = true;
    try {
      state.myName = name;
      await joinRoom(code, name);
      enterLobby();
    } catch (e) {
      showToast(e.message || 'Could not join');
    } finally {
      $('btn-join').disabled = false;
    }
  });

  // Mobile keyboards: the Enter/Go key submits the name screens directly,
  // no need to dismiss the keyboard and hunt for the button.
  $('join-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('btn-join').click(); }
  });
  $('host-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('btn-go-lobby').click(); }
  });

  // iOS keyboards overlay the page instead of resizing it, so the
  // bottom-anchored action bars would hide behind the keyboard. Track the
  // visual viewport and lift the bars to sit on top of it. (Android resizes
  // the layout itself via interactive-widget=resizes-content → gap stays 0.)
  if (window.visualViewport) {
    const liftBars = () => {
      const vv = window.visualViewport;
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.querySelectorAll('.sticky-actions').forEach(el => {
        el.style.transform = gap > 0 ? `translateY(-${gap}px)` : '';
      });
    };
    window.visualViewport.addEventListener('resize', liftBars);
    window.visualViewport.addEventListener('scroll', liftBars);
  }

  // ============================================================
  // SETUP SCREEN (host)
  // ============================================================
  // Imposter count thresholds — tied to the number of players in the lobby.
  // Host can pick from 1 up to maxForCount(players); selector unlocks
  // automatically as more players join.
  function currentMaxImposters() {
    const n = state.players.length;
    if (n >= 10) return 3;
    if (n >= 6)  return 2;
    return 1;
  }

  // Lobby stepper — host adjusts impostor count from the players card.
  $('lobby-imp-plus').addEventListener('click', () => {
    if (!db || !state.isHost || !state.roomCode) return;
    const max = currentMaxImposters();
    if (state.numImposters >= max) return;
    update(ref(db, `rooms-word/${state.roomCode}/meta`), { numImposters: state.numImposters + 1 }).catch(()=>{});
  });
  $('lobby-imp-minus').addEventListener('click', () => {
    if (!db || !state.isHost || !state.roomCode) return;
    if (state.numImposters <= 1) return;
    update(ref(db, `rooms-word/${state.roomCode}/meta`), { numImposters: state.numImposters - 1 }).catch(()=>{});
  });

  $('btn-go-lobby').addEventListener('click', async () => {
    const name = $('host-name').value.trim() || 'Host';
    $('btn-go-lobby').disabled = true;
    try {
      await createRoom(name, 1);
      showHostShare();
    } catch (e) {
      showToast('Failed to create room: ' + e.message);
    } finally {
      $('btn-go-lobby').disabled = false;
    }
  });

  // Show the share-the-code screen after a room is created, before the lobby.
  function showHostShare() {
    const code = state.roomCode || '----';
    const boxes = $('share-code-boxes');
    boxes.innerHTML = '';
    code.split('').forEach(ch => {
      const box = document.createElement('span');
      box.className = 'code-box';
      box.textContent = ch;
      boxes.appendChild(box);
    });
    renderQRInto($('share-qr'), code);
    go('host-share');
  }

  // Build a QR for a deep link that drops the scanner on the join-name step.
  // Uses the inlined qrcode-generator global; fails quietly to the code-only
  // view if anything goes wrong. Always uses SHARE_BASE (the public website),
  // never location.origin, so QR works when generated from inside the app too.
  function renderQRInto(el, code) {
    el.innerHTML = '';
    el.style.display = '';
    try {
      const url = `${SHARE_BASE}/?join=${encodeURIComponent(code)}`;
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      el.style.display = 'none'; // no QR — the code still works
    }
  }

  // Lobby QR popup
  function openLobbyQR() {
    if (!state.roomCode) return;
    $('lobby-qr-code').textContent = state.roomCode;
    renderQRInto($('lobby-qr-card'), state.roomCode);
    $('qr-modal-backdrop').classList.add('open');
  }
  function closeLobbyQR() { $('qr-modal-backdrop').classList.remove('open'); }
  $('lobby-qr-btn').addEventListener('click', openLobbyQR);
  $('qr-modal-close').addEventListener('click', closeLobbyQR);
  $('qr-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLobbyQR();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('qr-modal-backdrop').classList.contains('open')) closeLobbyQR();
  });

  // Lobby How-to-play popup — clones the landing-page steps (single source)
  function openHowTo() {
    const src = document.querySelector('#how-to-play .howto-steps');
    const body = $('howto-modal-body');
    if (src && body.childElementCount === 0) body.appendChild(src.cloneNode(true));
    $('howto-modal-backdrop').classList.add('open');
  }
  function closeHowTo() { $('howto-modal-backdrop').classList.remove('open'); }
  $('lobby-howto-btn').addEventListener('click', openHowTo);
  $('howto-modal-close').addEventListener('click', closeHowTo);
  $('howto-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeHowTo();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('howto-modal-backdrop').classList.contains('open')) closeHowTo();
  });

  // Copy the current room code to the clipboard (with a graceful fallback).
  async function copyRoomCode() {
    const code = state.roomCode;
    if (!code) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const t = document.createElement('textarea');
        t.value = code; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } finally { document.body.removeChild(t); }
      }
      showToast('Room code copied');
    } catch (e) {
      showToast('Could not copy');
    }
  }

  $('share-code-boxes').addEventListener('click', copyRoomCode);
  $('share-copy-btn').addEventListener('click', copyRoomCode);
  $('btn-share-continue').addEventListener('click', () => {
    attachRoomListener(); // now safe — host is leaving the share screen for the lobby
    enterLobby();
  });

  // ============================================================
  // LOBBY
  // ============================================================
  function enterLobby() {
    stopAllTimers();
    closeFbPopup(false);
    $('lobby-code-text').textContent = state.roomCode || '----';
    renderLobby();
    go('lobby');
  }

  function renderLobby() {
    const list = $('players-list');
    // Display order: host pinned on top, then newest join first so a new
    // player is immediately visible. state.players keeps its joinedAt-asc
    // order — this copy is presentation-only.
    const ordered = [...state.players].sort((a, b) =>
      (b.isHost - a.isHost) || (b.joinedAt - a.joinedAt));
    const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Before wiping the list, snapshot each current row's position keyed by
    // player id. Rows whose player just left become a fading ghost; survivors
    // get FLIP-slid to their new spot after the rebuild, so joins and drops
    // glide instead of snapping the roster.
    const firstRects = new Map();
    if (!reduceMotion) {
      const liveIds = new Set(ordered.map(p => p.id));
      [...list.children].forEach(c => {
        const pid = c.dataset.pid;
        if (!pid) return;
        const rect = c.getBoundingClientRect();
        firstRects.set(pid, rect);
        if (!liveIds.has(pid)) {
          // Player left (or their screen dropped presence). Forget them from
          // lobbySeen so a rejoin replays the pop-in entrance, symmetric with
          // the ghost exit. burstFired is left intact on purpose: a reconnect
          // gets the gentle pop-in but not a fresh confetti salvo.
          spawnLeaveGhost(c, rect);
          lobbySeen.delete(pid);
        }
      });
    }

    const initialPaint = lobbySeen.size === 0;
    list.innerHTML = '';
    ordered.forEach(p => {
      const row = document.createElement('div');
      row.dataset.pid = p.id;
      const isNew = isNewInLobby(p.id);
      row.className = 'player-row' + (!p.isHost && p.ready ? ' ready' : '') + (isNew ? ' just-joined' : '');
      const status = p.isHost ? '' : (p.ready ? '✓ Ready' : 'Waiting');
      row.innerHTML = `
        ${avatarHtml(p)}
        <div class="player-name">
          ${escapeHtml(p.name)}
          ${p.isHost ? '<span class="player-tag tag-host">Host</span>' : ''}
          ${p.isMe ? '<span class="you-pill">YOU</span>' : ''}
        </div>
        <div class="player-status">${status}</div>
      `;
      if (isNew) {
        // Rapid RTDB snapshots rebuild this row mid-animation; a negative
        // delay resumes the animation where it left off instead of
        // restarting it from opacity 0 (which reads as a blink).
        const elapsed = Date.now() - lobbySeen.get(p.id);
        row.style.animationDelay = `-${elapsed}ms`;
        const avEl = row.querySelector('.player-avatar');
        if (avEl) avEl.style.animationDelay = `-${elapsed}ms`;
      }
      list.appendChild(row);
      if (initialPaint) {
        burstFired.add(p.id);
      } else if (isNew && !burstFired.has(p.id)) {
        burstFired.add(p.id);
        // Fire synchronously — rAF can be throttled (backgrounded tab) until
        // after the next rebuild replaces this row, losing the burst.
        confettiBurst(row);
      }
    });

    if (!reduceMotion) flipRows(list, firstRects);

    const me = state.players.find(p => p.isMe);
    const isHost = me && me.isHost;
    const nonHosts = state.players.filter(p => !p.isHost);
    const readyCount = nonHosts.filter(p => p.ready).length;
    const total = state.players.length;
    const allReady = total >= MIN_PLAYERS && nonHosts.length > 0 && nonHosts.every(p => p.ready);

    $('ready-count').textContent = readyCount;
    $('player-count').textContent = nonHosts.length;

    // Imposter count stepper — controls show for host only, only when the
    // current player count unlocks a higher max (6+ → 2, 10+ → 3).
    const max = currentMaxImposters();
    if (isHost && state.numImposters > max && db && state.roomCode) {
      // Auto-clamp via Firebase when a player leaves and drops the cap;
      // the next snapshot will re-render with the corrected value.
      update(ref(db, `rooms-word/${state.roomCode}/meta`), { numImposters: max }).catch(()=>{});
    }
    const shown = Math.min(state.numImposters, max);
    $('imposter-count-num').textContent = shown;
    $('imposter-count-label').textContent = shown === 1 ? 'Impostor' : 'Impostors';
    const showSteppers = isHost && max > 1;
    $('lobby-imp-minus').style.display = showSteppers ? '' : 'none';
    $('lobby-imp-plus').style.display = showSteppers ? '' : 'none';
    $('lobby-imp-minus').disabled = shown <= 1;
    $('lobby-imp-plus').disabled = shown >= max;

    // Back button: host dissolves the room, players only remove themselves
    $('lobby-back-btn').textContent = isHost ? '← Quit Game' : '← Leave Room';

    // Ready button: hidden for host
    $('btn-ready').style.display = isHost ? 'none' : '';

    // Start button: host only, all non-hosts ready, >= MIN_PLAYERS total
    $('btn-start').disabled = !(isHost && allReady);

    if (!isHost) {
      $('btn-start').style.display = 'none';
      if (total < MIN_PLAYERS) {
        setLobbyStatus(`Need ${MIN_PLAYERS - total} more player${MIN_PLAYERS - total === 1 ? '' : 's'} to start.`);
      } else if (!allReady) {
        setLobbyStatus('Waiting for everyone to ready up…');
      } else {
        setLobbyStatus('Waiting for host to start…');
      }
    } else {
      $('btn-start').style.display = '';
      if (total < MIN_PLAYERS) {
        setLobbyStatus(`Need ${MIN_PLAYERS - total} more player${MIN_PLAYERS - total === 1 ? '' : 's'}. Share the code!`);
      } else if (!allReady) {
        const remaining = nonHosts.length - readyCount;
        setLobbyStatus(`Waiting for ${remaining} more to ready up…`);
      } else {
        setLobbyStatus('Everyone is ready. Hit start!');
      }
    }
    // Wake lock covers most phones; where it can't, rotate in the screen-on tip.
    updateLobbyHint();

    if (me && !isHost) {
      $('btn-ready').textContent = me.ready ? "I'm Not Ready" : "I'm Ready";
      $('btn-ready').classList.toggle('btn-secondary', me.ready);
      $('btn-ready').classList.toggle('btn-accent', !me.ready);
    }

    // Category: host sees tappable trigger that opens the modal sheet,
    // player sees the chosen category as static serif text.
    const trigger = $('category-trigger');
    const triggerText = $('category-trigger-text');
    const display = $('category-display');
    const hint = $('category-hint');
    const categorySummary = categoriesSummary(activeCategories());
    triggerText.textContent = categorySummary;
    display.textContent = categorySummary;
    if (isHost) {
      trigger.style.display = '';
      display.style.display = 'none';
      hint.style.display = '';
      hint.textContent = 'You pick the theme. A random secret word from your chosen categories is dealt each round.';
    } else {
      trigger.style.display = 'none';
      display.style.display = '';
      hint.style.display = 'none';
    }
    // If the modal is currently open, re-render so the selected row reflects
    // changes that came in via Firebase (e.g. another tab/admin pick).
    if ($('cat-modal-backdrop').classList.contains('open')) renderCategoryModal();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Category picker modal — host only. Two modes, like iPhone Photos:
  //  - Default: tapping a row picks that single category and closes (the
  //    original production behaviour). No tick rings, no Done bar.
  //  - Select: tapping the "Select" pill turns each row into a checkbox so
  //    several categories can be chosen at once; "Done" commits, and the pill
  //    (now "Cancel") drops back to default without applying. A room that
  //    already has more than one category open jumps straight into this mode.
  // In Select mode the in-progress choice lives in `modalSelection`; at least
  // one must stay selected, so tapping the last one off is ignored. Closing
  // via X / backdrop / Escape always discards and leaves the committed set.
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let modalSelection = new Set();
  let catMultiMode = false;

  // One-time nudge so existing hosts discover the new Select pill. Shows once
  // per device (localStorage) and only until the cutoff below — a "what's new"
  // tip is pointless for people who arrive after multi-select is old news.
  const MS_HINT_KEY = 'imp_word_mshint';
  const MS_HINT_UNTIL = Date.UTC(2026, 7, 1); // stop showing after 2026-08-01
  function maybeShowMultiHint() {
    const el = $('cat-multi-hint');
    if (!el) return;
    let seen = true;
    try { seen = localStorage.getItem(MS_HINT_KEY) === '1'; } catch (e) { seen = true; }
    // Skip if already seen, past the cutoff, or the sheet opened in Select
    // mode (a multi-category room — the host already knows about it).
    if (seen || Date.now() > MS_HINT_UNTIL || catMultiMode) { el.hidden = true; return; }
    el.hidden = false;
    try { localStorage.setItem(MS_HINT_KEY, '1'); } catch (e) {}
  }
  function hideMultiHint() {
    const el = $('cat-multi-hint');
    if (el) el.hidden = true;
  }

  function renderCategoryModal() {
    const list = $('cat-modal-list');
    list.innerHTML = '';
    const committed = activeCategories();
    CATEGORY_GROUPS.forEach(group => {
      const lbl = document.createElement('div');
      lbl.className = 'cat-group-label';
      lbl.textContent = group.label;
      list.appendChild(lbl);
      group.categories.forEach(cat => {
        const on = catMultiMode ? modalSelection.has(cat.name) : committed.includes(cat.name);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'cat-row' + (on ? ' selected' : '');
        row.dataset.cat = cat.name;
        row.setAttribute('aria-pressed', on ? 'true' : 'false');
        row.innerHTML =
          `<div class="cat-row-title">${escapeHtml(cat.name)}</div>` +
          `<div class="cat-row-desc">${escapeHtml(cat.description)}</div>` +
          (catMultiMode ? `<span class="cat-check" aria-hidden="true">${CHECK_SVG}</span>` : '');
        row.addEventListener('click', () => {
          if (catMultiMode) {
            if (modalSelection.has(cat.name)) {
              if (modalSelection.size === 1) return; // keep at least one
              modalSelection.delete(cat.name);
            } else {
              modalSelection.add(cat.name);
            }
            renderCategoryModal();
          } else {
            // Default mode: single pick applies immediately and closes.
            commitCategories([cat.name]);
          }
        });
        list.appendChild(row);
      });
    });
    $('cat-select-btn').textContent = catMultiMode ? 'Cancel' : 'Select';
    $('cat-select-btn').classList.toggle('active', catMultiMode);
    $('cat-modal-footer').style.display = catMultiMode ? '' : 'none';
  }

  function openCategoryModal() {
    if (!state.isHost) return;
    modalSelection = new Set(activeCategories());
    // Jump straight into Select mode when the room already spans several
    // categories, so the host sees and can edit the full set.
    catMultiMode = modalSelection.size > 1;
    renderCategoryModal();
    const back = $('cat-modal-backdrop');
    back.classList.add('open');
    back.scrollTop = 0;
    maybeShowMultiHint();
  }

  function closeCategoryModal() {
    hideMultiHint();
    $('cat-modal-backdrop').classList.remove('open');
  }

  function toggleSelectMode() {
    hideMultiHint();
    if (catMultiMode) {
      // Cancel — leave Select mode without applying.
      catMultiMode = false;
    } else {
      catMultiMode = true;
      modalSelection = new Set(activeCategories());
    }
    renderCategoryModal();
  }

  async function commitCategories(cats) {
    closeCategoryModal();
    if (!state.isHost || !db || !state.roomCode || !cats.length) return;
    try {
      // Keep `category` in sync (= first pick) for back-compat with any
      // reader that predates `categories`.
      await update(ref(db, `rooms-word/${state.roomCode}/meta`), { categories: cats, category: cats[0] });
    } catch (err) {
      showToast('Could not change category');
    }
  }

  $('category-trigger').addEventListener('click', openCategoryModal);
  $('cat-select-btn').addEventListener('click', toggleSelectMode);
  $('cat-modal-done').addEventListener('click', () => commitCategories([...modalSelection]));
  $('cat-modal-close').addEventListener('click', closeCategoryModal);
  $('cat-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCategoryModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('cat-modal-backdrop').classList.contains('open')) closeCategoryModal();
  });

  // ---- Feedback modal ----
  function openFeedbackModal() {
    const back = $('fb-modal-backdrop');
    back.classList.add('open');
    back.scrollTop = 0;
    setTimeout(() => $('fb-message').focus(), 50);
  }
  function closeFeedbackModal() {
    $('fb-modal-backdrop').classList.remove('open');
  }
  async function submitFeedback() {
    const msgEl = $('fb-message');
    const emailEl = $('fb-email');
    const sendBtn = $('fb-send');
    const message = msgEl.value.trim();
    if (!message) { msgEl.focus(); showToast('Please type a message first'); return; }
    const email = emailEl.value.trim().slice(0, 120);
    sendBtn.disabled = true;
    try {
      if (db) {
        await push(ref(db, `feedback/${GAME}`), {
          message: message.slice(0, 500),
          email: email || null,
          source: fbSource,
          country: (lastGeo && lastGeo.country) || null,
          countryCode: (lastGeo && lastGeo.cc) || null,
          version: ($('app-version') && $('app-version').textContent) || null,
          ts: serverTimestamp(),
        });
      }
      msgEl.value = '';
      emailEl.value = '';
      closeFeedbackModal();
      showToast('Thanks for the feedback! 🙏');
    } catch (e) {
      showToast('Could not send — please try again');
    } finally {
      sendBtn.disabled = false;
    }
  }
  $('feedback-link').addEventListener('click', () => { fbSource = 'landing'; openFeedbackModal(); });
  $('fb-modal-close').addEventListener('click', closeFeedbackModal);
  $('fb-send').addEventListener('click', submitFeedback);
  $('fb-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFeedbackModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('fb-modal-backdrop').classList.contains('open')) closeFeedbackModal();
  });

  // ---- Round-milestone feedback popup ----
  // Counts completed rounds per device (localStorage, shared across both
  // games — same origin). From FB_PROMPT_AT rounds on, the Round Over screen
  // auto-opens a small feedback popup — 2s after the reveal so it never
  // covers the payoff moment. It returns on later Round Overs until the
  // player interacts once (rate, open the form, or dismiss), then never
  // shows again on that device.
  const FB_PROMPT_AT = 20;
  let fbSource = 'landing'; // tags feedback records with where the form was opened from
  let fbpTimer = null;

  function countRoundAndMaybePrompt() {
    try {
      const n = (parseInt(localStorage.getItem('imp_fb_rounds'), 10) || 0) + 1;
      localStorage.setItem('imp_fb_rounds', String(n));
      if (localStorage.getItem('imp_fb_prompt_done')) return;
      if (n < FB_PROMPT_AT) return;
    } catch (e) { return; }
    clearTimeout(fbpTimer);
    fbpTimer = setTimeout(() => {
      if (state.screen !== 'over') return; // next round already started
      $('fbp-backdrop').classList.add('open');
      bumpFbPrompt('shown');
    }, 2000);
  }

  function markFbPromptDone() {
    try { localStorage.setItem('imp_fb_prompt_done', '1'); } catch (e) {}
  }

  // interacted=false → auto-close (next round started / left the room):
  // the player never made a choice, so the popup may return next Round Over.
  function closeFbPopup(interacted) {
    clearTimeout(fbpTimer);
    fbpTimer = null;
    $('fbp-backdrop').classList.remove('open');
    if (interacted) markFbPromptDone();
  }

  function dismissFbPopup() {
    try { if (!localStorage.getItem('imp_fb_prompt_done')) bumpFbPrompt('dismissed'); } catch (e) {}
    closeFbPopup(true);
  }

  function bumpFbPrompt(key) {
    if (!db || !analyticsEnabled()) return;
    update(ref(db, `analytics/${GAME}/fbprompt`), { [key]: increment(1) }).catch(() => {});
  }

  $('fb-emojis').addEventListener('click', (e) => {
    const btn = e.target.closest('.fb-emoji');
    if (!btn) return;
    markFbPromptDone();
    if (db) {
      push(ref(db, `feedback/${GAME}`), {
        rating: parseInt(btn.dataset.rating, 10),
        emoji: btn.textContent,
        source: 'rounds-milestone',
        country: (lastGeo && lastGeo.country) || null,
        countryCode: (lastGeo && lastGeo.cc) || null,
        version: ($('app-version') && $('app-version').textContent) || null,
        ts: serverTimestamp(),
      }).catch(() => {});
      bumpFbPrompt('rated');
      bumpAnalytics({ [`fbprompt/ratings/${btn.dataset.rating}`]: 1 });
    }
    $('fbp-title').textContent = 'Thanks! 🙏';
    $('fb-emojis').style.display = 'none';
    $('fb-prompt-link').textContent = 'Tell us more';
  });

  $('fb-prompt-link').addEventListener('click', () => {
    closeFbPopup(true);
    fbSource = 'rounds-milestone';
    openFeedbackModal();
  });

  $('fbp-close').addEventListener('click', dismissFbPopup);
  $('fbp-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) dismissFbPopup();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('fbp-backdrop').classList.contains('open')) dismissFbPopup();
  });

  $('lobby-code-chip').addEventListener('click', copyRoomCode);

  $('btn-ready').addEventListener('click', () => {
    fbToggleReady();
  });

  $('btn-start').addEventListener('click', () => {
    fbStartGame();
  });

  // ============================================================
  // GAMEPLAY — driven by meta.startAt (synced across clients)
  // ============================================================
  function beginGame() {
    closeFbPopup(false);
    go('game');
    runCountdown();
  }

  function runCountdown() {
    const overlay = $('countdown');
    const numEl = $('countdown-num');
    const startAt = state.meta && state.meta.startAt;
    if (!startAt) return;

    overlay.classList.add('active');

    let lastShown = -1;
    const tick = () => {
      const remaining = (startAt - nowSync()) / 1000;
      if (remaining <= 0) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
        overlay.classList.remove('active');
        showCard();
        return;
      }
      const n = Math.min(3, Math.ceil(remaining));
      if (n !== lastShown) {
        lastShown = n;
        numEl.textContent = n;
        numEl.style.animation = 'none';
        void numEl.offsetWidth;
        numEl.style.animation = '';
      }
    };
    tick();
    clearInterval(state.countdownTimer);
    state.countdownTimer = setInterval(tick, 60);
  }

  // Show this player's card: crewmates get the secret word, the imposter
  // gets the hint. Everything after this — clues, accusations, guessing —
  // happens out loud around the room.
  function showCard() {
    const meta = state.meta;
    const isImposter = meta.imposterIds && meta.imposterIds[state.myId];
    if (!meta.secretWord) { showToast('No word loaded'); return; }

    $('imposter-banner').style.display = isImposter ? 'inline-flex' : 'none';
    $('imposter-subhint').style.display = isImposter ? 'block' : 'none';
    $('game-role').textContent = isImposter ? 'YOUR HINT' : 'THE SECRET WORD';
    $('game-word').textContent = isImposter ? meta.imposterHint : meta.secretWord;
    $('word-card').classList.toggle('is-imposter', !!isImposter);

    $('btn-reveal').style.display = state.isHost ? '' : 'none';
    $('game-hint').textContent = state.isHost
      ? 'Take turns saying one clue word each. Tap Reveal when the round is decided.'
      : isImposter
        ? 'Blend in! Give a clue that fits without knowing the word.'
        : 'Take turns saying one clue word each — don\'t make it easy for the imposter.';
  }

  // ============================================================
  // REVEAL — host-only button on the card screen
  // ============================================================
  $('btn-reveal').addEventListener('click', () => {
    fbForceReveal();
  });

  function revealImposter() {
    stopAllTimers();
    const meta = state.meta || {};
    const imposters = state.players.filter(p => p.isImposter);
    const names = imposters.map(p => p.name + (p.isMe ? ' (YOU)' : '')).join(' & ');
    $('reveal-name').textContent = names || '—';
    $('reveal-word').textContent = meta.secretWord || '—';
    $('btn-replay').style.display = state.isHost ? '' : 'none';
    $('btn-home').textContent = state.isHost ? 'Quit Game' : 'Exit Room';
    countRoundAndMaybePrompt();
    go('over');
  }

  // ============================================================
  // GAME OVER
  // ============================================================
  $('btn-replay').addEventListener('click', () => {
    fbReplay();
  });

  $('btn-home').addEventListener('click', () => {
    leaveRoom();
  });

  // ============================================================
  // BACK BUTTONS
  // ============================================================
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      leaveRoom();
    });
  });

  // ============================================================
  // ANALYTICS  (cookie-free, aggregate counters in our own DB)
  // ------------------------------------------------------------
  // We never store IPs or any per-user identifier — only incrementing
  // aggregate counts, which is why this needs no consent banner. Everything
  // lives under analytics/<GAME>/ so a second game gets its own bucket, and
  // is split into two clearly-separated subtrees:
  //
  //   visits/  — someone OPENED the app (one per browser tab)
  //     visits/total
  //     visits/countries/<ISO code>
  //     visits/daily/<YYYY-MM-DD>/{count, countries/<ISO code>}
  //
  //   games/   — a 3+ player game was PLAYED (every play/replay counts)
  //     games/total
  //     games/countries/<ISO code>          (the host's country)
  //     games/categories/<name>, games/words/<word>
  //     games/daily/<YYYY-MM-DD>/{count, countries/<ISO code>, categories/<name>, words/<word>}
  // ============================================================

  // Last known coarse geo (set by trackSession); reused by the feedback form.
  let lastGeo = null;
  // Country rarely changes per device, so cache it. A page reload or in-tab
  // re-entry skips the visit re-count (imp_sess guard) and would otherwise
  // leave lastGeo null — hydrating from localStorage keeps game-country working.
  try { const c = localStorage.getItem('imp_geo'); if (c) lastGeo = JSON.parse(c); } catch (e) {}

  // Firebase keys can't contain . # $ [ ] / — sanitise free-form text.
  function safeKey(s) {
    return (String(s == null ? '' : s).replace(/[.#$\[\]/]/g, '_').trim().slice(0, 120)) || 'unknown';
  }

  // Analytics run ONLY in the real production environment, so trial runs
  // never pollute the live counters. "Real" means the public website
  // (impostorgames.com) or the native app (Capacitor WebView, origin
  // https://localhost). Everything else — Firebase Hosting preview channels
  // (*.web.app), localhost/127.0.0.1 dev, file:// — is treated as testing
  // and writes nothing. This gate covers every analytics write path.
  function analyticsEnabled() {
    try {
      if (window.Capacitor) return true; // native app = real usage
      const h = location.hostname;
      return h === 'impostorgames.com' || h === 'www.impostorgames.com';
    } catch (e) { return false; }
  }

  // Fire-and-forget atomic counter bumps. `paths` maps a path under
  // analytics/<GAME> to the amount to add. Never throws into callers.
  function bumpAnalytics(paths) {
    if (!db || !analyticsEnabled()) return;
    try {
      const payload = {};
      for (const p in paths) payload[p] = increment(paths[p]);
      update(ref(db, `analytics/${GAME}`), payload).catch(() => {});
    } catch (e) { /* analytics must never break gameplay */ }
  }

  function todayKey() { return new Date().toISOString().slice(0, 10); }

  // Aggregate error telemetry — same privacy model as the counters above:
  // we store a bucketed error LABEL and a count, never a stack trace, URL,
  // room code or user id. Lets a silent breakage (a word that won't load, a
  // Firebase write that throws) surface in analytics/<GAME>/errors instead of
  // by luck. Throttled per-label so a hot error loop can't spam the DB.
  const _errSeen = {};
  function trackError(label) {
    const key = safeKey(label).slice(0, 80);
    if (!key || key === 'unknown') return;
    const now = Date.now();
    if (_errSeen[key] && now - _errSeen[key] < 10000) return; // ≤1 bump / 10s / label
    _errSeen[key] = now;
    bumpAnalytics({ [`errors/${key}/count`]: 1, [`errors/daily/${todayKey()}/${key}`]: 1 });
  }
  // Catch-all for uncaught script + async failures. Resource 404s (e.g. an
  // <img> that fails to load) fire 'error' with no message — skip those.
  window.addEventListener('error', (e) => {
    const msg = (e && e.message) || (e && e.error && e.error.message);
    if (msg) trackError('js: ' + msg);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    const msg = r && (r.message || (typeof r === 'string' ? r : ''));
    if (msg) trackError('promise: ' + msg);
  });

  // Persist a resolved country so later page loads (which skip the visit
  // re-count) still have it for game tracking and the feedback form.
  function rememberGeo(geo) {
    lastGeo = geo;
    try { localStorage.setItem('imp_geo', JSON.stringify(geo)); } catch (e) {}
    return geo;
  }

  // Coarse geo (country only, no IP stored). Two free, key-less providers
  // with a fallback; returns null silently on any failure.
  async function fetchGeo() {
    try {
      const r = await fetch('https://ipwho.is/?fields=success,country,country_code');
      if (r.ok) { const d = await r.json(); if (d && d.success && d.country_code) return rememberGeo({ cc: d.country_code, country: d.country }); }
    } catch (e) {}
    try {
      const r = await fetch('https://ipapi.co/json/');
      if (r.ok) { const d = await r.json(); if (d && d.country_code) return rememberGeo({ cc: d.country_code, country: d.country_name }); }
    } catch (e) {}
    return null;
  }

  // One visit = one app open. Deduped per tab so a re-render never recounts.
  async function trackSession() {
    if (!db || !analyticsEnabled()) return;
    try { if (sessionStorage.getItem('imp_sess')) return; sessionStorage.setItem('imp_sess', '1'); } catch (e) {}
    const day = todayKey();
    const u = { 'visits/total': 1, [`visits/daily/${day}/count`]: 1 };
    const geo = await fetchGeo();
    if (geo) lastGeo = geo; // reused by the feedback form so it needn't re-fetch
    if (geo && geo.cc) {
      const cc = safeKey(geo.cc);
      u[`visits/countries/${cc}`] = 1;
      u[`visits/daily/${day}/countries/${cc}`] = 1;
    }
    bumpAnalytics(u);
  }

  // Logged once per round by the host only (single source of truth).
  // A round only starts with MIN_PLAYERS (3+) in the room, so each call here
  // means "a real game was played" — and every play/replay counts. The host's
  // country is recorded under games/countries/* so you can see where games
  // actually happen, separate from visits/* which counts app opens.
  async function trackRound(category, word) {
    if (!analyticsEnabled()) return;
    const day = todayKey();
    const cat = safeKey(category);
    const wrd = safeKey(word);
    const u = {
      'games/total': 1,
      [`games/categories/${cat}`]: 1,
      [`games/words/${wrd}`]: 1,
      [`games/daily/${day}/count`]: 1,
      [`games/daily/${day}/categories/${cat}`]: 1,
      [`games/daily/${day}/words/${wrd}`]: 1,
    };
    // Fallback for a brand-new host who starts a round before the initial
    // geo lookup has resolved: fetch on demand so the game still gets a
    // country. Runs in the background — never blocks gameplay.
    let geo = lastGeo;
    if (!geo || !geo.cc) { try { geo = await fetchGeo(); } catch (e) {} }
    if (geo && geo.cc) {
      const cc = safeKey(geo.cc);
      u[`games/countries/${cc}`] = 1;
      u[`games/daily/${day}/countries/${cc}`] = 1;
    }
    bumpAnalytics(u);
  }

  // ============================================================
  // INIT
  // ============================================================
  if (!FB_CONFIGURED) {
    setTimeout(() => showToast('Firebase not configured — see README', 4500), 800);
  }
  // When the screen/tab comes back, re-assert presence immediately rather
  // than waiting for the .info/connected listener to catch up. (We do NOT
  // remove the player on hide — onDisconnect handles real disconnects
  // server-side, and removing on hide is what kicked players out.)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.roomCode && state.myId) {
      refreshPresence();
      acquireWakeLock(); // the lock auto-releases when hidden; re-grab on return
    }
  });
  trackSession();
  go('home');

  // Deep link: a QR/shared URL like ?join=QW7T drops the visitor straight
  // into the join flow. We validate + route via the same path as manual entry.
  function routeJoinCode(raw) {
    if (!raw) return;
    const code = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length === 4 && FB_CONFIGURED && db) attemptCodeValidation(code);
  }

  // Web path: the param is in the page URL (impostorgames.com/?join=...).
  // Strip it afterwards so a refresh/back doesn't re-trigger the join.
  (function handleWebJoinDeepLink() {
    const raw = new URLSearchParams(location.search).get('join');
    if (!raw) return;
    history.replaceState(null, '', location.pathname);
    routeJoinCode(raw);
  })();

  // Native-app path: inside the Capacitor WebView the page loads from
  // https://localhost, so the join code never appears in location.search.
  // Instead the OS hands the tapped/scanned App Link to the @capacitor/app
  // plugin. Handle both a cold start (getLaunchUrl) and the app already
  // running (appUrlOpen). Same routeJoinCode() as the web path.
  (function handleNativeJoinDeepLink() {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App) return; // not running inside the native app
    const codeFromUrl = (u) => { try { return new URL(u).searchParams.get('join'); } catch (e) { return null; } };
    App.getLaunchUrl().then((res) => { if (res && res.url) routeJoinCode(codeFromUrl(res.url)); }).catch(() => {});
    App.addListener('appUrlOpen', (ev) => { if (ev && ev.url) routeJoinCode(codeFromUrl(ev.url)); });
  })();
})();
