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
  const ROUND_SECONDS = 30; // iTunes previews are ~30s
  const COUNTDOWN_MS = 4000;
  const MIN_PLAYERS = 3;
  // Host Picks mode: the host sits out, so the minimum is 3 actual dancers
  // (host + 3 = 4 people total). MIN_PLAYERS stays for category mode.
  const MIN_DANCERS_GM = 3;
  // Group modes (Find Your Squad / Partner Hunt) need at least two groups of
  // two, so four players is the floor. Host counts as a dancer here.
  const MIN_GROUP_PLAYERS = 4;
  const MAX_PLAYERS = 20;
  const DEFAULT_CATEGORY = '80s Hits';
  // Identifies this game inside shared infrastructure (analytics, and a
  // future multi-game hub). Each game gets its own namespace, e.g.
  // analytics/music/... so adding a second game never collides.
  const GAME = 'music';
  // Canonical public website base for shareable links (QR codes, deep links).
  // Hardcoded — NOT location.origin — so that when this same code runs inside
  // the native app (Capacitor WebView, origin https://localhost) the QR a host
  // generates still points friends at the real website. Friends without the
  // app open it on the web; friends with the app get routed in via App Links.
  const SHARE_BASE = 'https://impostorgames.com/dance';
  // A room with no deliberate activity for this long is considered dead:
  // the idle watchdog closes it, and createRoom will recycle its code.
  const IDLE_MS = 15 * 60 * 1000; // 15 minutes

  // Song lists per category. Each entry is a search query for the
  // iTunes Search API — "track artist" works well. Edit freely.
  const CATEGORIES = {
    '80s Hits': [
      'Billie Jean Michael Jackson',
      'Beat It Michael Jackson',
      'Like a Prayer Madonna',
      'Material Girl Madonna',
      'Take On Me a-ha',
      'Girls Just Want to Have Fun Cyndi Lauper',
      'I Wanna Dance with Somebody Whitney Houston',
      "Livin' on a Prayer Bon Jovi",
      'Wake Me Up Before You Go Go Wham',
      'Total Eclipse of the Heart Bonnie Tyler',
      'Every Breath You Take The Police',
      'You Make My Dreams Hall and Oates',
      'Africa Toto',
      "Don't Stop Believin Journey",
      'Sweet Dreams Eurythmics',
      'Karma Chameleon Culture Club',
      'Tainted Love Soft Cell',
      "Don't You Want Me The Human League",
      'Time After Time Cyndi Lauper',
      'The Final Countdown Europe',
      'Need You Tonight INXS',
      'Faith George Michael',
      'Careless Whisper George Michael',
      'Eye of the Tiger Survivor',
      'Jump Van Halen',
      "Sweet Child O' Mine Guns N' Roses",
      'Here I Go Again Whitesnake',
      'Hungry Like the Wolf Duran Duran',
      'Rio Duran Duran',
      'Come On Eileen Dexys Midnight Runners',
      '99 Luftballons Nena',
      'Walking on Sunshine Katrina and the Waves',
      'Should I Stay or Should I Go The Clash',
      'Money for Nothing Dire Straits',
      'Born in the U.S.A. Bruce Springsteen',
      'Footloose Kenny Loggins',
      'Maneater Hall and Oates',
      'Take My Breath Away Berlin',
      'Bette Davis Eyes Kim Carnes',
      'Pour Some Sugar on Me Def Leppard',
    ],
    'TikTok and Reels': [
      'Espresso Sabrina Carpenter',
      'Good Luck Babe Chappell Roan',
      'Hot To Go Chappell Roan',
      'Murder on the Dancefloor Sophie Ellis-Bextor',
      'Million Dollar Baby Tommy Richman',
      'A Bar Song Tipsy Shaboozey',
      'Apple Charli XCX',
      'Von Dutch Charli XCX',
      'Lunch Billie Eilish',
      'Stick Season Noah Kahan',
      'Boys a liar Pt 2 PinkPantheress Ice Spice',
      'Cupid Twin Version FIFTY FIFTY',
      'Strangers Kenya Grace',
      'Greedy Tate McRae',
      'Sprinter Dave Central Cee',
      'Texas Hold Em Beyonce',
      'I Had Some Help Post Malone',
      'Lose Control Teddy Swims',
      'Beautiful Things Benson Boone',
      'Too Sweet Hozier',
      'Birds of a Feather Billie Eilish',
      'Houdini Dua Lipa',
      'Please Please Please Sabrina Carpenter',
      'Taste Sabrina Carpenter',
      '360 Charli XCX',
      'Not Like Us Kendrick Lamar',
      'Paint The Town Red Doja Cat',
      'Saturn SZA',
      'Snooze SZA',
      'Water Tyla',
      "Lovin On Me Jack Harlow",
      'Agora Hills Doja Cat',
      'Si Antes Te Hubiera Conocido Karol G',
      'Gata Only FloyyMenor Cris Mj',
      'End of Beginning Djo',
      'Dance The Night Dua Lipa',
      'Vampire Olivia Rodrigo',
      'Cruel Summer Taylor Swift',
      'Fortnight Taylor Swift',
      'Pedro Jaxomy Agatino Romero',
    ],
    "Today's Pop": [
      'Die With A Smile Lady Gaga Bruno Mars',
      'APT Rose Bruno Mars',
      'Thats So True Gracie Abrams',
      "We Cant Be Friends Ariana Grande",
      'Yes And Ariana Grande',
      'Wildflower Billie Eilish',
      'Guess Charli XCX Billie Eilish',
      'Timeless The Weeknd Playboi Carti',
      'One Of The Girls The Weeknd JENNIE',
      'Pink Pony Club Chappell Roan',
      'Training Season Dua Lipa',
      'Illusion Dua Lipa',
      'Nasty Tinashe',
      "I Love You Im Sorry Gracie Abrams",
      'Sailor Song Gigi Perez',
      'Stargazing Myles Smith',
      "I Dont Wanna Wait David Guetta OneRepublic",
      'Bad Dreams Teddy Swims',
      'Flowers Miley Cyrus',
      'Anti-Hero Taylor Swift',
      'Karma Taylor Swift',
      'Calm Down Rema Selena Gomez',
      'Unholy Sam Smith Kim Petras',
      'As It Was Harry Styles',
      'Late Night Talking Harry Styles',
      'Kill Bill SZA',
      'Seven Jung Kook Latto',
      'Stay The Kid LAROI Justin Bieber',
      'Heat Waves Glass Animals',
      'Industry Baby Lil Nas X Jack Harlow',
      'Shivers Ed Sheeran',
      'Bad Habits Ed Sheeran',
      'Levitating Dua Lipa',
      'About Damn Time Lizzo',
      'Blinding Lights The Weeknd',
      'abcdefu GAYLE',
      'Until I Found You Stephen Sanchez',
      'golden hour JVKE',
      'Ghost Justin Bieber',
      'Snap Rosa Linn',
    ],
    '90s Hits': [
      'Baby One More Time Britney Spears',
      'Wannabe Spice Girls',
      'Smells Like Teen Spirit Nirvana',
      'Wonderwall Oasis',
      'No Scrubs TLC',
      'Waterfalls TLC',
      'I Want It That Way Backstreet Boys',
      'Everybody Backstreet Boys',
      'Bye Bye Bye NSYNC',
      'Believe Cher',
      'Vogue Madonna',
      'Gangstas Paradise Coolio',
      "U Cant Touch This MC Hammer",
      'Ice Ice Baby Vanilla Ice',
      'Genie in a Bottle Christina Aguilera',
      'Torn Natalie Imbruglia',
      'Macarena Los Del Rio',
      'Barbie Girl Aqua',
      'What Is Love Haddaway',
      'Mambo No 5 Lou Bega',
      'Livin la Vida Loca Ricky Martin',
      'Smooth Santana Rob Thomas',
      'Black Hole Sun Soundgarden',
      'Zombie The Cranberries',
      'Bitter Sweet Symphony The Verve',
      'Creep Radiohead',
      'Losing My Religion R.E.M.',
      'Enter Sandman Metallica',
      'November Rain Guns N Roses',
      'Under the Bridge Red Hot Chili Peppers',
      'Basket Case Green Day',
      'Self Esteem The Offspring',
      'Jump Around House of Pain',
      'No Diggity Blackstreet',
      'This Is How We Do It Montell Jordan',
      'Killing Me Softly The Fugees',
      'Tearin Up My Heart NSYNC',
      'Truly Madly Deeply Savage Garden',
      'I Will Always Love You Whitney Houston',
      'My Heart Will Go On Celine Dion',
    ],
    'K-Pop': [
      'Dynamite BTS',
      'Butter BTS',
      'Boy With Luv BTS',
      'How You Like That BLACKPINK',
      'Kill This Love BLACKPINK',
      'Pink Venom BLACKPINK',
      'Shut Down BLACKPINK',
      'Super Shy NewJeans',
      'OMG NewJeans',
      'Ditto NewJeans',
      'Hype Boy NewJeans',
      'Antifragile LE SSERAFIM',
      'Unforgiven LE SSERAFIM',
      'Perfect Night LE SSERAFIM',
      'Queencard I-DLE',
      'Tomboy I-DLE',
      'Nxde I-DLE',
      'Spicy aespa',
      'Supernova aespa',
      'Armageddon aespa',
      'Whiplash aespa',
      'After Like IVE',
      'I AM IVE',
      'Cheer Up TWICE',
      'TT TWICE',
      'God of Music SEVENTEEN',
      'Maestro SEVENTEEN',
      'Maniac Stray Kids',
      'S-Class Stray Kids',
      'Rockstar Lisa',
    ],
    'Latin Hits': [
      'Despacito Luis Fonsi',
      'Gasolina Daddy Yankee',
      'Con Altura Rosalia J Balvin',
      'Tusa Karol G Nicki Minaj',
      'Provenza Karol G',
      'Mi Ex Tenia Razon Karol G',
      'Mamiii Becky G Karol G',
      'Contigo Karol G Tiesto',
      'Titi Me Pregunto Bad Bunny',
      'Ojitos Lindos Bad Bunny',
      'Un x100to Grupo Frontera Bad Bunny',
      'Que Vuelvas Carin Leon Grupo Frontera',
      'El Amor de Su Vida Grupo Frontera',
      'Ella Baila Sola Eslabon Armado Peso Pluma',
      'La Bebe Yng Lvcas Peso Pluma',
      'Chantaje Shakira Maluma',
      'Hawai Maluma',
      'Felices los 4 Maluma',
      'Shakira Bzrp Music Sessions 53',
      'Monotonia Shakira Ozuna',
      'Copa Vacia Shakira Manuel Turizo',
      'Hips Dont Lie Shakira',
      'Waka Waka Shakira',
      'Taki Taki DJ Snake',
      'China Anuel AA',
      'Baila Conmigo Rauw Alejandro',
      'Classy 101 Feid Young Miko',
      'Mi Gente J Balvin',
      'Danza Kuduro Don Omar',
      'Bailando Enrique Iglesias',
    ],
    'Malayalam': [
      // Every query below is validated against the iTunes Search API
      // (same call the app makes): the first result with a previewUrl is
      // the intended song. Some queries deliberately omit or change the
      // movie name — that's what makes the right master surface first.
      'Kuthanthram Manjummel Boys',
      'Illuminati Aavesham',
      'Jada Sushin Shyam',
      'Galatta Aavesham',
      'Mathapithakkale Aavesham',
      'Angu Vaana Konilu ARM',
      'Kiliye ARM Malayalam',
      'Chandra Lokah',
      'Kalapakkaara King of Kotha',
      'Neela Nilave',
      'Ole Melody Thallumaala',
      'Kannil Pettole Thallumaala',
      'Mini Maharani Premalu',
      'Pistah Neram',
      'Chekele Avial',
      'Aadu Pambe Avial',
      'Nada Nada Avial',
      'Fish Rock Thaikkudam Bridge',
      'Navarasam Thaikkudam Bridge',
      'Darshana Hridayam',
      'Onakka Munthiri Hridayam',
      'Pularikalo',
      'Theerame',
      'Parudeesa Bheeshma Parvam',
      'Uyiril Thodum',
      'Cherathukal Kumbalangi Nights',
      'Aluva Puzhayude',
      'Jaathikkathottam Thaneer Mathan Dinangal',
      'Kudukku Love Action Drama',
      'Njan Jackson Allada Ambili',
      'Aaradhike',
      'Uyire Gauthamante Radham',
      'Parayuvaan Ishq Malayalam',
      'Nee Himamazhayayi Edakkad Battalion',
      'Mizhi Randilum',
      'Pavizha Mazhe Athiran',
      'Poomuthole Joseph',
      'Freak Penne Oru Adaar Love',
      'Manikya Malaraya Poovi Oru Adaar Love',
      'Jimikki Kammal Velipadinte Pusthakam',
      'Aaro Nenjil Godha',
      'Lailakame Ezra',
      'Thiruvaavaniraavu Jacobinte Swargarajyam',
      'Dooreyo',
      'Kaathirunnu Kaathirunnu Ennu Ninte Moideen',
      'Mukkathe Penne',
      'Chundari Penne Charlie',
      'Malare Premam',
      'Rockaankuthu Premam',
      'Scene Contra Premam',
      'Aayiram Kannumai',
      'Thudakkam Mangalyam Bangalore Days',
      'Ethu Kari Raavilum Bangalore Days',
      'Anuraagathin Velayil Thattathin Marayathu',
      'Muthuchippi Poloru Thattathin Marayathu',
      'Kattu Mooliyo Vineeth Sreenivasan',
      'Lajjavathiye Jassie Gift',
      'Kilukil Pambaram Kilukkam',
      'Karutha Penne Thenmavin Kombath',
      'Chingamasam Meesa Madhavan',
    ],
    'Tamil': [
      'Why This Kolaveri Di 3',
      'Vaathi Coming Master',
      'Arabic Kuthu Beast',
      'Rowdy Baby Maari 2',
      'Katchi Sera Sai Abhyankkar',
      'Aasa Kooda Sai Abhyankkar',
      'Jalabulajangu Don Anirudh',
      'Chikitu Coolie',
      'Monica Coolie Anirudh',
      'Golden Sparrow Dragon',
      'Manasilaayo Vettaiyan',
      'Naan Pizhai Kaathuvaakula Rendu Kaadhal',
      'Singappenney Bigil',
      'Vaseegara Bombay Jayashri',
      'Munbe Vaa Sillunu Oru Kaadhal',
      'Aalaporan Tamizhan Mersal',
      'Mersal Arasan Mersal',
      'Verithanam Bigil',
      'Kannana Kanne Naanum Rowdy Dhaan',
      'Thalli Pogathe Achcham Yenbadhu Madamaiyada',
      'Visiri Enai Noki Paayum Thota',
      'Megham Karukatha Thiruchitrambalam',
      'Thiruchitrambalam Thiruchitrambalam',
      'Kaavaalaa Jailer',
      'Hukum Jailer',
      'Dippam Dappam Kaathuvaakula Rendu Kaadhal',
      'Pathala Pathala Vikram',
      'Once Upon a Time Vikram',
      'Enjoy Enjaami Dhee Arivu',
      'Rakita Rakita Jagame Thandhiram',
      'Surviva Vivegam',
      'Naa Ready Leo',
      'Badass Leo',
      'Ordinary Person Leo',
      'Jimikki Ponnu Varisu',
      'Ranjithame Varisu',
      'Vennilave Vennilave Minsara Kanavu',
      'Anjali Anjali Duet',
      'Uyire Uyire Bombay',
      'Nenjukkule Kadal',
      'Adiye Kadal',
      'Marana Mass Petta',
    ],
    'Bollywood': [
      'Kesariya Pritam Brahmastra',
      'Apna Bana Le Bhediya',
      'Jhoome Jo Pathaan Pathaan',
      'Besharam Rang Pathaan',
      'Chaleya Jawan',
      'Tum Kya Mile Rocky Aur Rani Kii Prem Kahaani',
      'What Jhumka Rocky Aur Rani Kii Prem Kahaani',
      'Heeriye Jasleen Royal Arijit Singh',
      'O Maahi Dunki',
      'Lutt Putt Gaya Dunki',
      'Tere Vaaste Zara Hatke Zara Bachke',
      'Phir Aur Kya Chahiye Zara Hatke Zara Bachke',
      'Satranga Animal',
      'Arjan Vailly Animal',
      'Hua Main Animal',
      'Pehle Bhi Main Animal',
      'Tauba Tauba Bad Newz',
      'Aaj Ki Raat Stree 2',
      'Tum Hi Ho Aashiqui 2',
      'Channa Mereya Ae Dil Hai Mushkil',
      'Gerua Dilwale',
      'Tum Hi Aana Marjaavaan',
      'Kal Ho Naa Ho Kal Ho Naa Ho',
      'Tujhe Dekha To Dilwale Dulhania Le Jayenge',
      'Chaiyya Chaiyya Dil Se',
      'Kun Faya Kun Rockstar',
      'Sadda Haq Rockstar',
      'Galliyan Ek Villain',
      'Ghungroo War',
      'Apna Time Aayega Gully Boy',
      'Deva Deva Brahmastra',
      'Maan Meri Jaan King',
      'Kahani Suno Kaifi Khalil',
      'Raataan Lambiyan Shershaah',
      'Mann Bharrya B Praak',
      'Pasoori Coke Studio Ali Sethi',
      'Ranjha Shershaah',
      'Shayad Love Aaj Kal',
      'Bekhayali Kabir Singh',
      'Kalank Title Track Kalank',
    ],
    'Telugu': [
      'Naatu Naatu RRR',
      'Komuram Bheemudo RRR',
      'Etthara Jenda RRR',
      'Oo Antava Pushpa',
      'Srivalli Pushpa',
      'Saami Saami Pushpa',
      'Eyy Bidda Idhi Naa Adda Pushpa 2',
      'Sooseki Pushpa 2',
      'Peelings Pushpa 2',
      'Kissik Pushpa 2',
      'Buttabomma Ala Vaikunthapurramuloo',
      'Ramuloo Ramulaa Ala Vaikunthapurramuloo',
      'Samajavaragamana Ala Vaikunthapurramuloo',
      'OMG Daddy Ala Vaikunthapurramuloo',
      'Seeti Maar DJ Telugu',
      'Blockbuster Sarrainodu',
      'Kurchi Madathapetti Guntur Kaaram',
      'Dum Masala Guntur Kaaram',
      'Mind Block Sarileru Neekevvaru',
      'Hes So Cute Sarileru Neekevvaru',
      'Whattey Beauty Bheeshma',
      'Oosupodu Fidaa',
      'Vachinde Fidaa',
      'Inkem Inkem Inkem Kaavaale Geetha Govindam',
      'Vachindamma Geetha Govindam',
      'Kalaavathi Sarkaru Vaari Paata',
      'Penny Sarkaru Vaari Paata',
      'Dimaak Kharaab iSmart Shankar',
      'Ringa Ringa Arya 2',
      'Neeli Neeli Aakasam 30 Rojullo Preminchadam Ela',
    ],
    'Kannada': [
      'Sulthana KGF Chapter 2',
      'Toofan KGF Chapter 2',
      'Mehabooba KGF Chapter 2',
      'The Monster Song KGF Chapter 2',
      'Salaam Rocky Bhai KGF',
      'Varaha Roopam Kantara',
      'Singara Siriye Kantara',
      'Ra Ra Rakkamma Vikrant Rona',
      'Kaatera Kaatera',
      'Belageddu Kirik Party',
      'Minchagi Neenu Baralu Gaalipata',
      'Anumanave Illa Kariya 2',
      'Onde Ondu Sari Mungaru Male',
      'Anisutide Mungaru Male',
      'Mungaru Maleye Mungaru Male',
      'Ee Sanje Rangitaranga',
      'Ondu Malebillu',
      'Ondu Munjaavinali',
      'Modalasala Modalasala',
      'Cheluveye Ninne Nodalu',
      'Kariya I Love You Kariya',
      'Yaava Janmada Maitri',
      'Nee Bandu Ninthaaga',
      'If You Come Today Operation Diamond Racket',
      'Naguva Nayana Pallavi Anupallavi',
      'Karpoorada Gombe',
      'Baa Baaro Rasika Ranadheera',
      'Naa Ninna Mareyalaare',
      'Snehaloka Snehaloka',
      'Aakasha Deepavu Neenu',
    ],
  };

  // Grouped metadata for the category picker. Order here drives the
  // modal sheet layout; add a new entry under the right group to surface
  // a new category. Each `name` must match a key in CATEGORIES above.
  const CATEGORY_GROUPS = [
    {
      label: 'International',
      categories: [
        { name: 'TikTok and Reels', description: "What's trending on TikTok and Reels" },
        { name: "Today's Pop",      description: 'Chart-topping hits playing right now' },
        { name: 'K-Pop',            description: 'The biggest K-pop hits right now' },
        { name: 'Latin Hits',       description: 'Reggaeton and Latin chart-toppers' },
        { name: '80s Hits',         description: 'The biggest songs of the 80s' },
        { name: '90s Hits',         description: 'The biggest songs of the 90s' },
      ],
    },
    {
      label: 'Indian',
      categories: [
        { name: 'Bollywood',  description: 'Trending songs from Bollywood' },
        { name: 'Tamil',      description: 'Trending Tamil songs' },
        { name: 'Telugu',     description: 'Trending Telugu songs' },
        { name: 'Kannada',    description: 'Trending Kannada songs' },
        { name: 'Malayalam',  description: 'Trending Malayalam songs' },
      ],
    },
  ];

  // Game modes. 'category' (renamed Imposter Challenge in the UI) is the
  // original flow: the app picks two songs from the chosen category and
  // the host dances like everyone else. 'hostPicks' (renamed DJ Mode)
  // turns the host into a game master: they search for the exact group
  // song (and optionally the impostor's), sit the round out, can never
  // be the impostor, and watch knowing who it is. The internal ids stay
  // as-is so existing rooms and analytics keep working.
  // Mode illustrations (mascot art), converted to WebP for size. Square
  // 256px source, displayed small via .mode-row-icon / .mode-trigger-icon.
  const MODE_ICON_SHUFFLE = '<img src="/icons/modes/imposter.webp" alt="" width="256" height="256" loading="lazy">';
  const MODE_ICON_DJ = '<img src="/icons/modes/dj.webp" alt="" width="256" height="256" loading="lazy">';
  const MODE_ICON_SQUAD = '<img src="/icons/modes/squad.webp" alt="" width="256" height="256" loading="lazy">';
  const MODE_ICON_PARTNER = '<img src="/icons/modes/partner.webp" alt="" width="256" height="256" loading="lazy">';
  const MODES = [
    {
      id: 'category',
      name: 'Imposter Challenge',
      icon: MODE_ICON_SHUFFLE,
      description: 'One player hears a different song. Dance and catch the imposter.',
    },
    {
      id: 'hostPicks',
      name: 'DJ Mode',
      icon: MODE_ICON_DJ,
      description: 'The host becomes the DJ and picks the songs for an Imposter round.',
    },
    {
      id: 'findSquad',
      name: 'Find Your Squad',
      icon: MODE_ICON_SQUAD,
      description: 'Half the players hear the same song. Dance and find the player sharing your music.',
    },
    {
      id: 'partnerHunt',
      name: 'Partner Hunt',
      icon: MODE_ICON_PARTNER,
      description: 'Players are grouped into pairs. Each pair hears a different song. Find your matching teammate.',
      comingSoon: true,
    },
  ];
  // Rooms created before modes shipped have no meta.mode → treat as the
  // original category mode everywhere.
  function roomMode() { return (state.meta && state.meta.mode) || 'category'; }
  // Group modes (Find Your Squad, Partner Hunt) share one data model: N
  // distinct songs in meta.groupTracks + a per-player meta.groups assignment.
  // No impostor, no game master — the host dances like everyone else.
  function isGroupMode(m) { m = m || roomMode(); return m === 'findSquad' || m === 'partnerHunt'; }
  // How many groups a mode forms for n players. Squad = two teams; Partner =
  // pairs (with one trio when n is odd, so floor(n/2) groups).
  function groupCountFor(mode, n) {
    if (mode === 'findSquad') return 2;
    if (mode === 'partnerHunt') return Math.max(1, Math.floor(n / 2));
    return 1;
  }
  // Assign players to groups → { playerId: groupIndex }. Players are shuffled
  // first so grouping (and which group becomes the odd trio) is random.
  function assignGroups(mode, players) {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const n = shuffled.length;
    const map = {};
    if (mode === 'findSquad') {
      // Split as evenly as possible; the first team gets the extra when odd.
      const firstSize = Math.ceil(n / 2);
      shuffled.forEach((p, i) => { map[p.id] = i < firstSize ? 0 : 1; });
      return { map, numGroups: 2 };
    }
    // partnerHunt: pairs, plus one trio when odd. Since players are already
    // shuffled, making the first group the trio is effectively random.
    const numGroups = Math.max(1, Math.floor(n / 2));
    const trio = (n % 2) === 1; // one group of three absorbs the odd player
    let idx = 0;
    shuffled.forEach((p, i) => {
      map[p.id] = idx;
      const size = (trio && idx === 0) ? 3 : 2;
      // advance to the next group once this one is full (and groups remain)
      const filled = shuffled.filter(q => map[q.id] === idx).length;
      if (filled >= size && idx < numGroups - 1) idx++;
    });
    return { map, numGroups };
  }

  // Pairs of royalty-free tracks — similar BPM/vibe but different melodies.
  // Track A = crewmate song, Track B = imposter song.
  // iTunes Search API helpers — fetch a 30-second preview MP3 for a song query.

  // Resolved previews are cached in localStorage for 24h so repeat rounds
  // in a session don't re-hit iTunes. This makes round starts faster and
  // avoids the API rate-limiting that long party sessions can trigger
  // ("Could not load song previews"). TTL is kept short because cached
  // previewUrls can eventually rot — a stale URL would silently break a
  // round, which is worse than one extra lookup.
  const PREVIEW_CACHE_KEY = 'imp_previews_v1';
  const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
  function previewCacheGet(query) {
    try {
      const all = JSON.parse(localStorage.getItem(PREVIEW_CACHE_KEY)) || {};
      const hit = all[query];
      if (hit && hit.url && (Date.now() - hit.at) < PREVIEW_TTL_MS) {
        return { title: hit.title, artist: hit.artist, url: hit.url };
      }
    } catch (e) {}
    return null;
  }
  function previewCachePut(query, p) {
    try {
      const all = JSON.parse(localStorage.getItem(PREVIEW_CACHE_KEY)) || {};
      all[query] = { title: p.title, artist: p.artist, url: p.url, at: Date.now() };
      for (const k in all) { // drop expired entries so the blob never grows unbounded
        if (!all[k] || (Date.now() - all[k].at) >= PREVIEW_TTL_MS) delete all[k];
      }
      localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  async function fetchPreview(query) {
    const cached = previewCacheGet(query);
    if (cached) return cached;
    // limit=5 so we can skip top hits that lack a previewUrl (re-recordings,
    // region-restricted masters) instead of giving up on the song. This must
    // never throw — pickPair relies on null to mean "try the next song".
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000); // don't hang a round on a slow request
      let res;
      try { res = await fetch(url, { signal: ctrl.signal }); }
      finally { clearTimeout(timer); }
      if (!res.ok) return null;
      const data = await res.json();
      const results = (data && data.results) || [];
      const r = results.find(x => x && x.previewUrl);
      if (!r) return null;
      const p = { title: r.trackName, artist: r.artistName, url: r.previewUrl };
      previewCachePut(query, p);
      return p;
    } catch (e) {
      return null; // network error, timeout, or bad JSON — treat as no preview
    }
  }

  // Free-text iTunes search for the Host Picks song modal. Returns rich
  // picks — trackId/artistId/genre feed the auto-pick-similar cascade,
  // art feeds the result rows. Never throws; [] means "no results".
  // No localStorage caching here: search terms are free-form and the
  // preview cache is keyed for pool queries.
  async function searchItunes(term, limit = 10) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      let res;
      try { res = await fetch(url, { signal: ctrl.signal }); }
      finally { clearTimeout(timer); }
      if (!res.ok) return [];
      const data = await res.json();
      return ((data && data.results) || [])
        .filter(r => r && r.previewUrl)
        .map(r => ({
          title: r.trackName,
          artist: r.artistName,
          url: r.previewUrl,
          trackId: r.trackId || 0,
          artistId: r.artistId || 0,
          genre: r.primaryGenreName || '',
          art: r.artworkUrl100 || r.artworkUrl60 || '',
        }));
    } catch (e) {
      return []; // network error, timeout, or bad JSON — show "no results"
    }
  }

  // Firebase keys can't contain . # $ [ ] /. Song queries and category
  // names are ASCII-safe today, but sanitize anyway to future-proof.
  function sanitizeKey(s) { return String(s).replace(/[.#$\[\]/]/g, '_'); }

  // The host can pick several categories at once; a round draws from their
  // union. `meta.categories` is the array; older rooms (or a client mid-
  // deploy) may still carry only the single `meta.category`, so fall back to
  // that, then to the default. Names that no longer exist in the catalog are
  // dropped so a stale pick can never empty the pool.
  function activeCategories() {
    const m = state.meta;
    if (m && Array.isArray(m.categories) && m.categories.length) {
      const valid = m.categories.filter(c => CATEGORIES[c]);
      if (valid.length) return valid;
    }
    if (m && m.category && CATEGORIES[m.category]) return [m.category];
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

  // Pick a fresh pair from the union of the selected categories, skipping
  // songs already played in this room. Each candidate carries its source
  // category so the caller can record it under the right played bucket. When
  // fewer than 2 unplayed remain across the whole union, the pool is treated
  // as exhausted and `reset` signals the caller to wipe the played buckets.
  async function pickPair(categoryNames, playedMap) {
    const cats = (categoryNames && categoryNames.length) ? categoryNames : [DEFAULT_CATEGORY];
    const played = playedMap || {};
    const union = [];
    cats.forEach(c => (CATEGORIES[c] || []).forEach(q => union.push({ q, cat: c })));
    const isPlayed = ({ q, cat }) => (played[sanitizeKey(cat)] || {})[sanitizeKey(q)];
    const unplayed = union.filter(x => !isPlayed(x));
    const reset = unplayed.length < 2;
    const usePool = reset ? union : unplayed;
    const shuffled = [...usePool].sort(() => Math.random() - 0.5);
    let a = null, b = null;
    for (const { q, cat } of shuffled) {
      const p = await fetchPreview(q);
      if (!p) continue;
      if (!a) { a = { ...p, query: q, cat }; continue; }
      if (p.url !== a.url && p.title !== a.title) { b = { ...p, query: q, cat }; break; }
    }
    if (!a || !b) throw new Error("Couldn't load songs — check your connection and tap Start again");
    return { a, b, reset };
  }

  // Group modes need `count` clearly-distinct songs from the selected
  // categories (one per team/pair). Mirrors pickPair but with no played
  // ledger — group rounds don't dedupe across rounds. Each pick must have a
  // preview and differ from the others by url and title. Throws (caught by
  // fbStartGame's recovery) if the pool can't supply enough distinct tracks.
  async function pickDistinctSongs(categoryNames, count) {
    const cats = (categoryNames && categoryNames.length) ? categoryNames : [DEFAULT_CATEGORY];
    const union = [];
    cats.forEach(c => (CATEGORIES[c] || []).forEach(q => union.push(q)));
    const shuffled = [...union].sort(() => Math.random() - 0.5);
    const picks = [];
    for (const q of shuffled) {
      if (picks.length >= count) break;
      const p = await fetchPreview(q);
      if (!p) continue;
      if (picks.some(x => x.url === p.url || x.title === p.title)) continue;
      picks.push({ title: p.title, artist: p.artist, url: p.url });
    }
    if (picks.length < count) throw new Error("Couldn't load enough songs — check your connection and tap Start again");
    return picks;
  }

  // Estimate a preview's "vibe" — a 0..1 score where ballads land low and
  // bangers land high. Downloads the 30s preview (the iTunes CDN sends
  // open CORS headers), decodes it with the Web Audio API, and measures
  // the zero-crossing rate: bright, percussive, danceable tracks (hi-hats,
  // snares, synths) cross zero far more often per second than voice/piano/
  // strings ballads. Measured on real previews: bangers ~4000+/s, ballads
  // ~1300–2000/s — a clean gap. ZCR is loudness-invariant and needs no
  // beat tracking (naive tempo autocorrelation suffered octave errors and
  // scored "Beat It" below "My Heart Will Go On"). Returns null on any
  // failure — never throws.
  let vibeAudioCtx = null;
  async function analyzeVibe(url) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      let res;
      try { res = await fetch(url, { signal: ctrl.signal }); }
      finally { clearTimeout(timer); }
      if (!res.ok) return null;
      const raw = await res.arrayBuffer();
      if (!vibeAudioCtx) vibeAudioCtx = new AC();
      const decoded = await vibeAudioCtx.decodeAudioData(raw);
      if (decoded.duration < 5) return null; // too short to say anything
      const chan = decoded.getChannelData(0);
      let zc = 0;
      for (let i = 1; i < chan.length; i++) {
        if ((chan[i] >= 0) !== (chan[i - 1] >= 0)) zc++;
      }
      const zcr = zc / decoded.duration;
      return Math.min(1, Math.max(0, (zcr - 1000) / 3500));
    } catch (e) {
      return null; // network / decode / no Web Audio — caller falls back
    }
  }

  // Host Picks mode: when the host skips the impostor song, pick one with
  // a deliberately DIFFERENT vibe — a slow song against a banger (or vice
  // versa) is what makes the impostor's dancing visibly off. Candidates
  // still come from related sources (same artist first, then genre) so the
  // language/culture fits the room, but the final pick maximizes measured
  // tempo/energy contrast via analyzeVibe. If analysis fails everywhere,
  // any related song still works; the DEFAULT_CATEGORY pool is the last
  // resort. Every candidate must have a preview and differ from the crew song.
  async function autoPickContrastTrack(crew) {
    const differs = r => r && r.previewUrl && r.previewUrl !== crew.url && r.trackName !== crew.title;
    const toTrack = r => ({ title: r.trackName, artist: r.artistName, url: r.previewUrl });
    const sample = (arr, k) => [...arr].sort(() => Math.random() - 0.5).slice(0, k);
    const fetchResults = async (url) => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        let res;
        try { res = await fetch(url, { signal: ctrl.signal }); }
        finally { clearTimeout(timer); }
        if (!res.ok) return [];
        const data = await res.json();
        return (data && data.results) || [];
      } catch (e) { return []; }
    };

    let artistResults = [];
    if (crew.artistId) {
      artistResults = (await fetchResults(`https://itunes.apple.com/lookup?id=${crew.artistId}&entity=song&limit=50`))
        .filter(r => r && r.wrapperType === 'track');
    }
    if (!artistResults.length && crew.artist) {
      artistResults = await fetchResults(`https://itunes.apple.com/search?term=${encodeURIComponent(crew.artist)}&entity=song&limit=25`);
    }
    const genreResults = crew.genre
      ? await fetchResults(`https://itunes.apple.com/search?term=${encodeURIComponent(crew.genre)}&entity=song&limit=25`)
      : [];

    // Analysis budget: up to 4 same-artist + 4 genre previews (~500KB each,
    // fetched in parallel) — enough spread to find a contrast without
    // making the host wait on a dozen downloads.
    const seen = new Set([crew.url]);
    const candidates = [];
    for (const r of [...sample(artistResults.filter(differs), 4), ...sample(genreResults.filter(differs), 4)]) {
      if (!seen.has(r.previewUrl)) { seen.add(r.previewUrl); candidates.push(r); }
    }

    if (candidates.length) {
      const [crewVibe, ...vibes] = await Promise.all([
        analyzeVibe(crew.url),
        ...candidates.map(r => analyzeVibe(r.previewUrl)),
      ]);
      if (crewVibe !== null) {
        let bestIdx = -1, bestDiff = -1;
        vibes.forEach((v, i) => {
          if (v === null) return;
          const d = Math.abs(v - crewVibe);
          if (d > bestDiff) { bestDiff = d; bestIdx = i; }
        });
        if (bestIdx >= 0) return toTrack(candidates[bestIdx]);
      }
      return toTrack(pick(candidates)); // analysis unavailable — related is still fine
    }

    const fallbackPool = [...CATEGORIES[DEFAULT_CATEGORY]].sort(() => Math.random() - 0.5);
    for (const q of fallbackPool) {
      const p = await fetchPreview(q);
      if (p && p.url !== crew.url && p.title !== crew.title) return p;
    }
    throw new Error("Couldn't find an impostor song — pick one yourself or tap Start again");
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
    votes: {},
    pendingJoinCode: null,
    roundTimer: null,
    countdownTimer: null,
    idleTimer: null,
    audio: document.getElementById('audio-player'),
    visualizerTimer: null,
    serverTimeOffset: 0,
    // Host Picks mode: the host's chosen songs live ONLY here until game
    // start — never in RTDB pre-start, since every client can read the room
    // JSON and could peek. A host page reload loses them, which is fine:
    // reloading already drops the host out of the room entirely.
    hostPick: { crew: null, imposter: null },
    songPickTarget: null, // 'crew' | 'imposter' — slot the search modal fills
    previewAudio: null,   // lazy Audio() for tap-to-preview; never state.audio
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

  function fmtTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ============================================================
  // ROOM OPERATIONS (Firebase)
  // ============================================================
  async function createRoom(name, numImposters) {
    if (!db) throw new Error('Firebase not configured');
    let code;
    for (let i = 0; i < 5; i++) {
      code = genRoomCode();
      const snap = await get(ref(db, `rooms/${code}/meta`));
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
    await set(ref(db, `rooms/${code}`), {
      meta: {
        hostId: myId,
        numImposters,
        category: DEFAULT_CATEGORY,
        mode: 'category',
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
    const roomSnap = await get(ref(db, `rooms/${code}`));
    if (!roomSnap.exists() || !roomSnap.val().meta) throw new Error('Room not found');
    const room = roomSnap.val();
    const meta = room.meta;
    if (meta.phase !== 'lobby') throw new Error('Game already in progress');
    if (Object.keys(room.players || {}).length >= MAX_PLAYERS) throw new Error('Room is full');

    const myId = genId();
    const joinedAt = nowSync();
    const av = pickAvatar(room.players);
    await set(ref(db, `rooms/${code}/players/${myId}`), {
      name, ready: false, joinedAt, av
    });
    update(ref(db, `rooms/${code}/meta`), { lastActivity: serverTimestamp() }).catch(()=>{});
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
      const metaSnap = await get(ref(db, `rooms/${code}/meta`));
      if (!metaSnap.exists()) return;
      if (state.roomCode !== code || state.myId !== id) return;
      const myRef = ref(db, `rooms/${code}/players/${id}`);
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
    update(ref(db, `rooms/${state.roomCode}/meta`), { lastActivity: serverTimestamp() }).catch(()=>{});
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
      try { await remove(ref(db, `rooms/${state.roomCode}`)); } catch (e) {}
    }, 60000);
  }
  function stopIdleWatch() {
    if (state.idleTimer) { clearInterval(state.idleTimer); state.idleTimer = null; }
  }

  function attachRoomListener() {
    startIdleWatch();
    const roomRef = ref(db, `rooms/${state.roomCode}`);
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
      const prevMode = state.meta ? ((state.meta.mode) || 'category') : null;
      state.meta = meta;
      state.players = players;
      // Mode switched (by the host, but every client sees it): the host's
      // local song picks belong to the old mode — drop them and close the
      // search modal so stale picks can't leak into the next round.
      if (prevMode !== null && roomMode() !== prevMode && meta.hostId === state.myId) {
        state.hostPick = { crew: null, imposter: null };
        closeSongModal();
      }
      state.votes = data.votes || {};
      state.numImposters = meta.numImposters || 1;
      state.isHost = meta.hostId === state.myId;
      const meNow = players.find(p => p.isMe);
      if (meNow) state.myReady = meNow.ready;

      if (state.screen === 'lobby') renderLobby();
      const phase = meta.phase;
      if (phase !== prevPhase) {
        if (phase === 'lobby' && state.screen !== 'lobby') enterLobby();
        else if ((phase === 'countdown' || phase === 'playing') && state.screen !== 'game') beginGame();
        else if (phase === 'voting' && state.screen !== 'vote') beginVoting();
        else if (phase === 'over' && state.screen !== 'over') revealImposter();
      }
    });
  }

  async function fbToggleReady() {
    if (!db || !state.roomCode) return;
    const me = state.players.find(p => p.isMe);
    if (!me) return;
    await update(ref(db, `rooms/${state.roomCode}/players/${state.myId}`), {
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
    startHint.textContent = 'Loading songs…';
    try {
      const gm = roomMode() === 'hostPicks';
      const cats = activeCategories();

      if (isGroupMode()) {
        // Find Your Squad / Partner Hunt: no impostor, host dances too.
        // Pick one distinct song per group and hand each player a group
        // index. Everything imposter-specific is cleared so a switch from a
        // prior round leaves no stale track/imposter data behind.
        const mode = roomMode();
        const players = state.players;
        const numGroups = groupCountFor(mode, players.length);
        const songs = await pickDistinctSongs(cats, numGroups);
        const { map } = assignGroups(mode, players);
        const gStartAt = nowSync() + COUNTDOWN_MS;
        await update(ref(db, `rooms/${state.roomCode}`), {
          'meta/phase': 'countdown',
          'meta/startAt': gStartAt,
          'meta/groupTracks': songs,
          'meta/groups': map,
          'meta/imposterIds': null,
          'meta/crewmateTrack': null,
          'meta/imposterTrack': null,
          'meta/lastActivity': serverTimestamp(),
          'votes': null,
        });
        trackRound(cats[0], songs[0] && songs[0].title, mode);
        setTimeout(() => {
          update(ref(db, `rooms/${state.roomCode}/meta`), { phase: 'playing' }).catch(()=>{});
        }, Math.max(0, gStartAt - nowSync()) + 200);
        return;
      }

      const playedMap = (state.meta && state.meta.played) || {};
      let pair;
      if (gm) {
        // Host Picks mode: the host chose the crew song (start is gated on
        // it); the impostor song is theirs too, or auto-picked to contrast.
        // Tracks are stripped to the meta shape — the local picks carry
        // extra iTunes fields (ids, genre, art) no other client needs.
        const crew = state.hostPick.crew;
        if (!crew) throw new Error('Pick the group song first');
        if (!state.hostPick.imposter) startHint.textContent = 'Finding an impostor song with a different vibe…';
        const imp = state.hostPick.imposter || await autoPickContrastTrack(crew);
        const strip = t => ({ title: t.title, artist: t.artist, url: t.url });
        pair = { a: strip(crew), b: strip(imp) };
      } else {
        try {
          pair = await pickPair(cats, playedMap);
        } catch (e1) {
          // One silent retry — absorbs a transient network blip or a brief
          // iTunes throttle without bothering the host.
          pair = await pickPair(cats, playedMap);
        }
      }

      // Impostor pool: in Host Picks mode the host is the game master and
      // can never be the impostor. Clamp defensively — the lobby stepper
      // already keeps numImposters within the dancer count.
      const pool = gm ? state.players.filter(p => !p.isHost) : state.players;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const imposters = shuffled.slice(0, Math.min(state.numImposters, Math.max(1, pool.length - 1)));
      const imposterIds = {};
      imposters.forEach(p => { imposterIds[p.id] = true; });

      const startAt = nowSync() + COUNTDOWN_MS;

      const updates = {
        'meta/phase': 'countdown',
        'meta/startAt': startAt,
        'meta/imposterIds': imposterIds,
        'meta/crewmateTrack': pair.a,
        'meta/imposterTrack': pair.b,
        // Clear any group-mode data from a prior round in this room.
        'meta/groupTracks': null,
        'meta/groups': null,
        'meta/lastActivity': serverTimestamp(),
        'votes': null,
      };
      if (!gm) {
        // The played ledger is category-pool machinery — host-picked songs
        // are arbitrary and never need dedupe bookkeeping. Each pick is
        // recorded under its own source category so the union dedupe keeps
        // working when several categories are selected.
        const aCat = sanitizeKey(pair.a.cat);
        const bCat = sanitizeKey(pair.b.cat);
        const aKey = sanitizeKey(pair.a.query);
        const bKey = sanitizeKey(pair.b.query);
        if (pair.reset) {
          // Pool exhausted — wipe the played buckets for every selected
          // category, then seed this round's picks into their buckets.
          cats.forEach(c => { updates[`meta/played/${sanitizeKey(c)}`] = null; });
          const seed = {};
          seed[aCat] = { [aKey]: true };
          (seed[bCat] = seed[bCat] || {})[bKey] = true;
          Object.keys(seed).forEach(c => { updates[`meta/played/${c}`] = seed[c]; });
        } else {
          updates[`meta/played/${aCat}/${aKey}`] = true;
          updates[`meta/played/${bCat}/${bKey}`] = true;
        }
      }
      await update(ref(db, `rooms/${state.roomCode}`), updates);

      trackRound((pair.a && pair.a.cat) || cats[0], pair.a && pair.a.title, gm ? 'hostPicks' : 'category');

      setTimeout(() => {
        update(ref(db, `rooms/${state.roomCode}/meta`), { phase: 'playing' }).catch(()=>{});
      }, Math.max(0, startAt - nowSync()) + 200);
    } catch (e) {
      trackError('song_load_failed');
      showToast(e.message || 'Could not load songs');
      startBtn.disabled = false;
      startHint.textContent = prevHint;
    }
  }

  async function fbStartVoting() {
    if (!db || !state.isHost) return;
    await update(ref(db, `rooms/${state.roomCode}/meta`), { phase: 'voting', lastActivity: serverTimestamp() });
  }

  async function fbForceReveal() {
    if (!db || !state.isHost) return;
    await update(ref(db, `rooms/${state.roomCode}/meta`), { phase: 'over', lastActivity: serverTimestamp() });
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
    updates['meta/crewmateTrack'] = null;
    updates['meta/imposterTrack'] = null;
    updates['meta/lastActivity'] = serverTimestamp();
    updates['votes'] = null;
    await update(ref(db, `rooms/${state.roomCode}`), updates);
  }

  async function leaveRoom(skipDelete) {
    stopAllTimers();
    stopHintRotation();
    releaseWakeLock();
    hideAudioOverlay();
    closeFbPopup(false);
    closeSongModal();
    state.hostPick = { crew: null, imposter: null };
    try { state.audio.pause(); state.audio.src = ''; } catch(e){}

    if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
    // Cancel the pending auto-removal so it can't fire after we've left.
    if (db && state.roomCode && state.myId) {
      try { onDisconnect(ref(db, `rooms/${state.roomCode}/players/${state.myId}`)).cancel(); } catch(e){}
    }

    if (db && state.roomCode && state.myId && !skipDelete) {
      try {
        if (state.isHost) {
          await remove(ref(db, `rooms/${state.roomCode}`));
        } else {
          await remove(ref(db, `rooms/${state.roomCode}/players/${state.myId}`));
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
    clearInterval(state.roundTimer);
    clearInterval(state.visualizerTimer);
    state.countdownTimer = null;
    state.roundTimer = null;
    state.visualizerTimer = null;
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
    unlockAudio();
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
      const roomSnap = await get(ref(db, `rooms/${code}`));
      if (!roomSnap.exists() || !roomSnap.val().meta) {
        showToast('No room found with that code');
        clearCodeBoxes();
        return;
      }
      const room = roomSnap.val();
      if (room.meta.phase !== 'lobby') {
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
    unlockAudio();
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
    unlockAudio();
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
    // Host Picks mode: the host can never be the impostor, so the
    // thresholds count dancers (players minus host), not room size.
    const n = roomMode() === 'hostPicks'
      ? Math.max(0, state.players.length - 1)
      : state.players.length;
    if (n >= 10) return 3;
    if (n >= 6)  return 2;
    return 1;
  }

  // Lobby stepper — host adjusts impostor count from the players card.
  $('lobby-imp-plus').addEventListener('click', () => {
    if (!db || !state.isHost || !state.roomCode) return;
    const max = currentMaxImposters();
    if (state.numImposters >= max) return;
    update(ref(db, `rooms/${state.roomCode}/meta`), { numImposters: state.numImposters + 1 }).catch(()=>{});
  });
  $('lobby-imp-minus').addEventListener('click', () => {
    if (!db || !state.isHost || !state.roomCode) return;
    if (state.numImposters <= 1) return;
    update(ref(db, `rooms/${state.roomCode}/meta`), { numImposters: state.numImposters - 1 }).catch(()=>{});
  });

  $('btn-go-lobby').addEventListener('click', async () => {
    const name = $('host-name').value.trim() || 'Host';
    unlockAudio();
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
    stopSongPreview();
    // Host Picks mode: every round is a fresh pick. fbReplay already wiped
    // the tracks from meta; clearing the local picks here makes the lobby
    // re-prompt "Pick the group song…" and re-gate the Start button.
    if (state.isHost && roomMode() === 'hostPicks') {
      state.hostPick = { crew: null, imposter: null };
    }
    $('lobby-code-text').textContent = state.roomCode || '----';
    renderLobby();
    go('lobby');
    maybeShowModeHint();
  }

  function renderLobby() {
    const list = $('players-list');
    // Display order: host pinned on top, then newest join first so a new
    // player is immediately visible. state.players keeps its joinedAt-asc
    // order — this copy is presentation-only.
    const ordered = [...state.players].sort((a, b) =>
      (b.isHost - a.isHost) || (b.joinedAt - a.joinedAt));
    const gm = roomMode() === 'hostPicks';
    const group = isGroupMode();
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
          ${p.isHost ? `<span class="player-tag tag-host">${gm ? 'DJ' : 'Host'}</span>` : ''}
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
    // In Host Picks mode the host isn't a dancer, so the minimum counts
    // non-hosts (host + MIN_DANCERS_GM people total); category mode keeps
    // counting everyone including the host.
    const minOk = gm ? nonHosts.length >= MIN_DANCERS_GM
                     : group ? total >= MIN_GROUP_PLAYERS
                     : total >= MIN_PLAYERS;
    const allReady = minOk && nonHosts.length > 0 && nonHosts.every(p => p.ready);

    $('ready-count').textContent = readyCount;
    $('player-count').textContent = nonHosts.length;

    // Imposter count stepper — controls show for host only, only when the
    // current player count unlocks a higher max (6+ → 2, 10+ → 3).
    const max = currentMaxImposters();
    if (isHost && state.numImposters > max && db && state.roomCode) {
      // Auto-clamp via Firebase when a player leaves and drops the cap;
      // the next snapshot will re-render with the corrected value.
      update(ref(db, `rooms/${state.roomCode}/meta`), { numImposters: max }).catch(()=>{});
    }
    const shown = Math.min(state.numImposters, max);
    $('imposter-count-num').textContent = shown;
    $('imposter-count-label').textContent = shown === 1 ? 'Impostor' : 'Impostors';
    // Group modes have no impostor, so hide the whole pill (and its stepper).
    $('imposter-info').style.display = group ? 'none' : '';
    const showSteppers = isHost && max > 1 && !group;
    $('lobby-imp-minus').style.display = showSteppers ? '' : 'none';
    $('lobby-imp-plus').style.display = showSteppers ? '' : 'none';
    $('lobby-imp-minus').disabled = shown <= 1;
    $('lobby-imp-plus').disabled = shown >= max;

    // Back button: host dissolves the room, players only remove themselves
    $('lobby-back-btn').textContent = isHost ? '← Quit Game' : '← Leave Room';

    // Ready button: hidden for host
    $('btn-ready').style.display = isHost ? 'none' : '';

    // Start button: host only, all non-hosts ready, enough players for the
    // mode — and in Host Picks mode the host must have picked the group song.
    const crewPicked = !gm || !!state.hostPick.crew;
    $('btn-start').disabled = !(isHost && allReady && crewPicked);

    // "Need N more" wording: category mode counts players (host dances too),
    // Host Picks mode counts dancers (host excluded).
    const short = gm ? MIN_DANCERS_GM - nonHosts.length
                     : group ? MIN_GROUP_PLAYERS - total
                     : MIN_PLAYERS - total;
    const noun = gm ? 'dancer' : 'player';
    if (!isHost) {
      $('btn-start').style.display = 'none';
      if (short > 0) {
        setLobbyStatus(`Need ${short} more ${noun}${short === 1 ? '' : 's'} to start.`);
      } else if (!allReady) {
        setLobbyStatus('Waiting for everyone to ready up…');
      } else {
        setLobbyStatus('Waiting for host to start…');
      }
    } else {
      $('btn-start').style.display = '';
      if (short > 0) {
        setLobbyStatus(`Need ${short} more ${noun}${short === 1 ? '' : 's'}. Share the code!`);
      } else if (!allReady) {
        const remaining = nonHosts.length - readyCount;
        setLobbyStatus(`Waiting for ${remaining} more to ready up…`);
      } else if (!crewPicked) {
        setLobbyStatus('Pick the group song to start.');
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

    // Combined Mode + Music/Songs card.
    //
    // Host view: mode picker on top, thin divider, then the mode-specific
    // control below — a category picker (Imposter Challenge) or the two song
    // pick buttons (DJ Mode). Under-trigger hints are gone by design; the
    // start-hint below the Start button surfaces any blocker
    // ("Pick the group song to start", "Need N more dancers…").
    //
    // Player view: no mode section, no divider — just the MUSIC label and
    // a single serif line ("80s Mode" / "DJ Mode") so the card stays lean.
    const modeMeta = MODES.find(m => m.id === roomMode()) || MODES[0];
    const trigger = $('category-trigger');
    const triggerText = $('category-trigger-text');
    const display = $('category-display');
    const categorySummary = categoriesSummary(activeCategories());

    $('mode-trigger-text').textContent = modeMeta.name;
    $('mode-trigger-icon').innerHTML = modeMeta.icon;
    triggerText.textContent = categorySummary;

    if (isHost) {
      $('mode-trigger').classList.remove('readonly');
      $('mode-music-card').classList.remove('compact');
      $('mode-section').style.display = '';
      $('mode-music-divider').style.display = '';
      $('category-card-label').textContent = gm ? 'Songs' : 'Music Category';
      if (gm) {
        trigger.style.display = 'none';
        display.style.display = 'none';
        $('song-pick-wrap').style.display = '';
        $('pick-crew-text').textContent = state.hostPick.crew
          ? `🎵 ${state.hostPick.crew.title} — ${state.hostPick.crew.artist}`
          : 'Pick the group song…';
        $('pick-imp-text').textContent = state.hostPick.imposter
          ? `🎵 ${state.hostPick.imposter.title} — ${state.hostPick.imposter.artist}`
          : 'Impostor song (optional)';
        $('pick-imp-clear').style.display = state.hostPick.imposter ? '' : 'none';
      } else {
        trigger.style.display = '';
        display.style.display = 'none';
        $('song-pick-wrap').style.display = 'none';
      }
    } else {
      // Players get a compact, label-less card: mode icon + name, a divider,
      // then a music line with a note glyph. In DJ Mode the exact song is the
      // host's secret, so the line just reads "host's choice". The mode trigger
      // loses its button chrome/chevron so it doesn't look tappable.
      $('mode-trigger').classList.add('readonly');
      $('mode-music-card').classList.add('compact');
      $('mode-section').style.display = '';
      $('mode-music-divider').style.display = '';
      trigger.style.display = 'none';
      $('song-pick-wrap').style.display = 'none';
      display.style.display = '';
      const musicText = gm ? "Host's Choice" : categorySummary;
      display.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="18" cy="16" r="3" fill="currentColor"/></svg>'
        + '<span>' + escapeHtml(musicText) + '</span>';
    }
    // If the modal is currently open, re-render so the selected row reflects
    // changes that came in via Firebase (e.g. another tab/admin pick).
    if ($('cat-modal-backdrop').classList.contains('open')) renderCategoryModal();
    if ($('mode-modal-backdrop').classList.contains('open')) renderModeModal();
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
  const MS_HINT_KEY = 'imp_dance_mshint';
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

  // One-time "new game mode" nudge in the lobby, pointing at the mode picker.
  // Host-only (only the host can switch modes), shown once per device and only
  // until the cutoff — a "what's new" tip is pointless once the mode is old news.
  const MODE_HINT_KEY = 'imp_dance_modehint';
  const MODE_HINT_UNTIL = Date.UTC(2026, 9, 1); // stop showing after 2026-10-01
  function maybeShowModeHint() {
    const el = $('mode-new-hint');
    if (!el) return;
    let seen = true;
    try { seen = localStorage.getItem(MODE_HINT_KEY) === '1'; } catch (e) { seen = true; }
    if (seen || Date.now() > MODE_HINT_UNTIL || !state.isHost) { el.hidden = true; return; }
    el.hidden = false;
    try { localStorage.setItem(MODE_HINT_KEY, '1'); } catch (e) {}
  }
  function hideModeHint() {
    const el = $('mode-new-hint');
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
      await update(ref(db, `rooms/${state.roomCode}/meta`), { categories: cats, category: cats[0] });
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

  // Game-mode picker modal — host only opens it; tap a row to set the
  // mode in Firebase and close. Mirrors the category modal.
  function renderModeModal() {
    const list = $('mode-modal-list');
    list.innerHTML = '';
    const current = roomMode();
    MODES.forEach(mode => {
      if (mode.comingSoon) {
        // Teaser card: not selectable. The "I want this" button records
        // demand (a counter in analytics) so we can decide whether to build
        // the full mode. See interest helpers below.
        const card = document.createElement('div');
        card.className = 'cat-row mode-row mode-soon';
        card.innerHTML =
          `<div class="mode-row-icon">${mode.icon}</div>` +
          `<div class="mode-row-body">` +
            `<div class="mode-row-titrow">` +
              `<span class="cat-row-title">${escapeHtml(mode.name)}</span>` +
              `<span class="mode-soon-badge">Coming soon</span>` +
            `</div>` +
            `<div class="cat-row-desc">${escapeHtml(mode.description)}</div>` +
            `<button type="button" class="mode-interest-btn">🙋 I want this sooner</button>` +
          `</div>`;
        const btn = card.querySelector('.mode-interest-btn');
        syncInterestBtn(btn);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          recordPartnerHuntInterest(btn);
        });
        list.appendChild(card);
        return;
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cat-row mode-row' + (mode.id === current ? ' selected' : '');
      row.innerHTML =
        `<div class="mode-row-icon">${mode.icon}</div>` +
        `<div class="mode-row-body">` +
          `<div class="cat-row-title">${escapeHtml(mode.name)}</div>` +
          `<div class="cat-row-desc">${escapeHtml(mode.description)}</div>` +
        `</div>`;
      row.addEventListener('click', async () => {
        closeModeModal();
        if (!state.isHost || !db || !state.roomCode) return;
        if (mode.id === current) return;
        try {
          await update(ref(db, `rooms/${state.roomCode}/meta`), { mode: mode.id });
          touchRoom();
        } catch (err) {
          showToast('Could not change mode');
        }
      });
      list.appendChild(row);
    });
  }

  // Partner Hunt interest signal — a cookie-free demand counter, deduped per
  // device via localStorage so one browser counts once. The host reads the
  // total in the Firebase console (analytics/<GAME>/interest/partnerHunt).
  const INTEREST_KEY = 'imp_interest_partnerHunt';
  function interestAlready() {
    try { return localStorage.getItem(INTEREST_KEY) === '1'; } catch (e) { return false; }
  }
  function syncInterestBtn(btn) {
    if (!btn || !interestAlready()) return;
    btn.textContent = "🎉 You're on the list";
    btn.disabled = true;
    btn.classList.add('interest-done');
  }
  function recordPartnerHuntInterest(btn) {
    if (interestAlready()) { syncInterestBtn(btn); return; }
    try { localStorage.setItem(INTEREST_KEY, '1'); } catch (e) {}
    syncInterestBtn(btn);
    const day = todayKey();
    bumpAnalytics({
      'interest/partnerHunt': 1,
      [`interest/daily/${day}/partnerHunt`]: 1,
    });
    showToast("Thanks! We'll build it if enough of you want it 🎉");
  }

  function openModeModal() {
    if (!state.isHost) return;
    hideModeHint();
    renderModeModal();
    const back = $('mode-modal-backdrop');
    back.classList.add('open');
    back.scrollTop = 0;
  }

  function closeModeModal() {
    $('mode-modal-backdrop').classList.remove('open');
  }

  $('mode-trigger').addEventListener('click', openModeModal);
  $('mode-new-hint').addEventListener('click', hideModeHint);
  $('mode-modal-close').addEventListener('click', closeModeModal);
  $('mode-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('mode-modal-backdrop').classList.contains('open')) closeModeModal();
  });

  // Song search modal (Host Picks mode) — the host searches iTunes, taps ▶
  // to preview, taps the row to select. Selections stay host-local (see
  // state.hostPick). Previews use a dedicated Audio element so the game
  // player (state.audio) and its autoplay-overlay logic stay untouched.
  let songSearchTimer = null;
  let songSearchSeq = 0;       // stale-response guard for out-of-order results
  let previewUrlPlaying = null;

  const PLAY_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  function previewAudioEl() {
    if (!state.previewAudio) {
      state.previewAudio = new Audio();
      state.previewAudio.addEventListener('ended', () => {
        previewUrlPlaying = null;
        refreshSongPlayButtons();
      });
    }
    return state.previewAudio;
  }

  function stopSongPreview() {
    if (state.previewAudio) { try { state.previewAudio.pause(); } catch (e) {} }
    previewUrlPlaying = null;
    refreshSongPlayButtons();
  }

  function toggleSongPreview(url) {
    if (previewUrlPlaying === url) { stopSongPreview(); return; }
    const a = previewAudioEl();
    previewUrlPlaying = url;
    a.src = url;
    a.volume = 0.85;
    a.play().catch(() => { previewUrlPlaying = null; refreshSongPlayButtons(); });
    refreshSongPlayButtons();
  }

  function refreshSongPlayButtons() {
    document.querySelectorAll('#song-search-results .song-row-play').forEach(btn => {
      const playing = !!previewUrlPlaying && btn.dataset.url === previewUrlPlaying;
      btn.classList.toggle('playing', playing);
      btn.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
    });
  }

  function renderSongResults(tracks, message) {
    const list = $('song-search-results');
    list.innerHTML = '';
    if (message) {
      const div = document.createElement('div');
      div.className = 'song-hint-row';
      div.textContent = message;
      list.appendChild(div);
    }
    tracks.forEach(track => {
      const row = document.createElement('div');
      row.className = 'song-row';
      row.setAttribute('role', 'button');
      const art = track.art
        ? `<img class="song-row-art" src="${escapeHtml(track.art)}" alt="" loading="lazy">`
        : '<div class="song-row-art"></div>';
      row.innerHTML = `
        ${art}
        <div class="song-row-info">
          <div class="song-row-title">${escapeHtml(track.title)}</div>
          <div class="song-row-artist">${escapeHtml(track.artist)}</div>
        </div>
        <button type="button" class="song-row-play" data-url="${escapeHtml(track.url)}" aria-label="Preview">${PLAY_SVG}</button>
      `;
      row.querySelector('.song-row-play').addEventListener('click', (e) => {
        e.stopPropagation(); // preview, don't select
        toggleSongPreview(track.url);
      });
      row.addEventListener('click', () => selectSongPick(track));
      list.appendChild(row);
    });
  }

  function selectSongPick(track) {
    const target = state.songPickTarget;
    if (!target) return;
    const other = target === 'crew' ? state.hostPick.imposter : state.hostPick.crew;
    if (other && other.url === track.url) { showToast('Pick two different songs'); return; }
    state.hostPick[target] = track;
    closeSongModal();
    renderLobby();
    touchRoom();
  }

  function openSongModal(target) {
    if (!state.isHost || roomMode() !== 'hostPicks') return;
    state.songPickTarget = target;
    $('song-modal-title').textContent = target === 'crew' ? 'Pick the group song' : 'Pick the impostor song';
    $('song-search-input').value = '';
    renderSongResults([], 'Search for any song');
    const back = $('song-modal-backdrop');
    back.classList.add('open');
    back.scrollTop = 0;
    touchRoom(); // browsing songs is deliberate activity — keep the idle watchdog away
    setTimeout(() => $('song-search-input').focus(), 60);
  }

  function closeSongModal() {
    $('song-modal-backdrop').classList.remove('open');
    state.songPickTarget = null;
    clearTimeout(songSearchTimer);
    songSearchSeq++; // invalidate any in-flight search
    stopSongPreview();
  }

  $('song-search-input').addEventListener('input', () => {
    const term = $('song-search-input').value.trim();
    clearTimeout(songSearchTimer);
    if (term.length < 2) {
      renderSongResults([], 'Search for any song');
      return;
    }
    songSearchTimer = setTimeout(async () => {
      const seq = ++songSearchSeq;
      renderSongResults([], 'Searching…');
      const tracks = await searchItunes(term, 10);
      if (seq !== songSearchSeq) return; // superseded by a newer search
      renderSongResults(tracks, tracks.length ? '' : 'No songs found — try a different search.');
    }, 350);
  });

  $('pick-crew-btn').addEventListener('click', () => openSongModal('crew'));
  $('pick-imp-btn').addEventListener('click', () => openSongModal('imposter'));
  $('pick-imp-clear').addEventListener('click', () => {
    state.hostPick.imposter = null;
    renderLobby();
  });
  $('song-modal-close').addEventListener('click', closeSongModal);
  $('song-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSongModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('song-modal-backdrop').classList.contains('open')) closeSongModal();
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
    unlockAudio();
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
        startPlayback();
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

  function startPlayback() {
    const meta = state.meta;
    // Host Picks mode: the host is the game master — they hear the crew
    // song (they're never in imposterIds, but be explicit) and get a GM
    // banner naming the impostor(s) instead of playing along blind.
    // Group modes (Find Your Squad / Partner Hunt): every player, host
    // included, plays their own group's song. No impostor, no game master.
    const groupMode = isGroupMode();
    const isGM = !groupMode && roomMode() === 'hostPicks' && state.isHost;
    const isImposter = !groupMode && !isGM && meta.imposterIds && meta.imposterIds[state.myId];
    let track;
    if (groupMode) {
      const gi = meta.groups && meta.groups[state.myId];
      track = meta.groupTracks && meta.groupTracks[(gi != null ? gi : 0)];
    } else {
      track = isImposter ? meta.imposterTrack : meta.crewmateTrack;
    }
    if (!track || !track.url) { showToast('No track loaded'); return; }

    $('imposter-banner').style.display = isImposter ? 'inline-flex' : 'none';
    $('imposter-subhint').style.display = isImposter ? 'block' : 'none';
    $('gm-banner').style.display = isGM ? 'inline-flex' : 'none';
    $('gm-subhint').style.display = isGM ? 'block' : 'none';
    if (isGM) {
      const impNames = state.players.filter(p => p.isImposter).map(p => p.name).join(' & ');
      $('gm-subhint').textContent = impNames ? `Impostor: ${impNames}` : '';
    }
    $('game-role').textContent = '🎵 NOW PLAYING';
    $('game-track').textContent = `${track.title} — ${track.artist}`;
    $('time-total').textContent = fmtTime(ROUND_SECONDS);
    $('time-current').textContent = '0:00';
    $('progress-fill').style.width = '0%';

    buildVisualizer();
    startVisualizer();

    const audio = state.audio;
    audio.src = track.url;
    audio.volume = 0.85;

    const begin = () => {
      const offset = Math.max(0, (nowSync() - meta.startAt) / 1000);
      try { audio.currentTime = offset; } catch(e){}
      const p = audio.play();
      if (p && p.catch) p.catch(showAudioOverlay);
    };
    if (audio.readyState >= 2) begin();
    else audio.addEventListener('canplay', begin, { once: true });

    clearInterval(state.roundTimer);
    state.roundTimer = setInterval(() => {
      const elapsed = (nowSync() - meta.startAt) / 1000;
      $('time-current').textContent = fmtTime(Math.max(0, Math.floor(elapsed)));
      $('progress-fill').style.width = Math.min(100, (elapsed / ROUND_SECONDS) * 100) + '%';
      if (elapsed >= ROUND_SECONDS) {
        clearInterval(state.roundTimer);
        state.roundTimer = null;
        if (state.isHost) fbStartVoting();
      }
    }, 200);

    $('btn-reveal').style.display = state.isHost ? '' : 'none';
    $('btn-reveal').textContent = 'End Round';
    $('game-hint').textContent = isGM
      ? "You're watching — everyone else is dancing."
      : groupMode
        ? "Dance to your song and find the others on your wavelength."
        : "Dance to the song! Watch who's off the vibe.";
  }

  function buildVisualizer() {
    const vis = $('visualizer');
    vis.innerHTML = '';
    const count = 24;
    for (let i = 0; i < count; i++) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      vis.appendChild(bar);
    }
  }

  function startVisualizer() {
    clearInterval(state.visualizerTimer);
    const bars = document.querySelectorAll('#visualizer .bar');
    state.visualizerTimer = setInterval(() => {
      bars.forEach((b, i) => {
        const h = 10 + Math.random() * 140;
        b.style.transform = 'scaleY(' + (h / 150).toFixed(3) + ')';
      });
    }, 110);
  }

  // ============================================================
  // REVEAL
  // ============================================================
  $('btn-reveal').addEventListener('click', () => {
    fbStartVoting();
  });

  $('btn-reveal-now').addEventListener('click', () => {
    fbForceReveal();
  });

  // ============================================================
  // DISCUSSION (post-song)
  // ============================================================
  function beginVoting() {
    stopAllTimers();
    hideAudioOverlay();
    try { state.audio.pause(); } catch(e){}
    const group = isGroupMode();
    // Group modes have no impostor to accuse — the discussion is about
    // matching up, and the button reveals the teams instead.
    $('discuss-title').textContent = group ? 'Find Your Group' : 'Find the Impostor';
    $('discuss-sub').textContent = group ? 'who shared your song?' : 'who danced off the vibe?';
    $('btn-reveal-now').textContent = group ? 'Reveal Groups' : 'Reveal Impostor';
    $('btn-reveal-now').style.display = state.isHost ? '' : 'none';
    $('discuss-hint').textContent = state.isHost
      ? (group
          ? 'Everyone locked in their guess? Hit Reveal to show the groups.'
          : roomMode() === 'hostPicks'
            ? 'You know who it is — enjoy the debate, then reveal.'
            : 'Hit Reveal when everyone is ready.')
      : (group
          ? 'waiting for the host to reveal the groups….'
          : 'waiting for host to reveal impostor….');
    go('vote');
  }

  function revealImposter() {
    stopAllTimers();
    hideAudioOverlay();
    try { state.audio.pause(); } catch(e){}
    const meta = state.meta || {};
    $('btn-replay').style.display = state.isHost ? '' : 'none';
    $('btn-home').textContent = state.isHost ? 'Quit Game' : 'Exit Room';

    if (isGroupMode()) {
      // Group modes reveal the teams instead of a single impostor. Swap the
      // impostor card + two-track panel out for the grouped list.
      $('reveal-card').style.display = 'none';
      $('reveal-extras').style.display = 'none';
      renderGroupReveal(meta);
      $('reveal-groups').style.display = '';
      $('screen-over').querySelector('h1').innerHTML = '<span class="reveal-emoji">🎉</span>The Reveal!';
      $('reveal-sub').textContent = 'Round complete. Here are the squads…';
      $('reveal-sub').style.display = '';
      countRoundAndMaybePrompt();
      go('over');
      return;
    }

    // Restore impostor-mode layout (a room can switch modes between rounds).
    $('reveal-card').style.display = '';
    $('reveal-extras').style.display = '';
    $('reveal-groups').style.display = 'none';
    $('reveal-sub').style.display = 'none';
    $('screen-over').querySelector('h1').textContent = 'Round Over';
    const cTrack = meta.crewmateTrack || { title: '—', artist: '' };
    const iTrack = meta.imposterTrack || { title: '—', artist: '' };
    const imposters = state.players.filter(p => p.isImposter);
    const names = imposters.map(p => p.name + (p.isMe ? ' (YOU)' : '')).join(' & ');
    $('reveal-name').textContent = names || '—';
    $('crew-track-title').textContent = cTrack.title || '—';
    $('crew-track-artist').textContent = cTrack.artist || '';
    $('imp-track-title').textContent = iTrack.title || '—';
    $('imp-track-artist').textContent = iTrack.artist || '';
    countRoundAndMaybePrompt();
    go('over');
  }

  // Build the grouped reveal: one card per squad with its song and member
  // chips. The viewer's own squad is shown first and labelled "YOUR SQUAD"
  // (teal); the other is "THE OTHER SQUAD" (red). Members come from
  // meta.groups (playerId → index), keyed the same as playback (state.myId).
  const REVEAL_NOTE_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 17V5l10-2v11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="17" r="2.5"/><circle cx="16.5" cy="14" r="2.5"/></svg>';
  function renderGroupReveal(meta) {
    const groups = meta.groups || {};
    const tracks = meta.groupTracks || [];
    const wrap = $('reveal-groups');
    const byIndex = {};
    Object.keys(groups).forEach(pid => {
      const gi = groups[pid];
      (byIndex[gi] = byIndex[gi] || []).push(pid);
    });
    const myGi = groups[state.myId];
    const chipFor = pid => {
      const pl = state.players.find(p => p.id === pid);
      const name = pl ? escapeHtml(pl.name) : 'Player';
      const av = pl ? avatarHtml(pl) : '';
      const you = pl && pl.isMe ? '<span class="you-pill">YOU</span>' : '';
      return `<span class="squad-chip">${av}<span class="squad-chip-name">${name}</span>${you}</span>`;
    };
    // Viewer's own squad first, then the rest in index order.
    const indices = Object.keys(byIndex).map(Number)
      .sort((a, b) => (a === myGi ? -1 : b === myGi ? 1 : a - b));
    const twoSquads = indices.length === 2;
    wrap.innerHTML = indices.map((gi, n) => {
      const mine = gi === myGi;
      const tag = mine ? 'YOUR SQUAD' : (twoSquads ? 'THE OTHER SQUAD' : 'SQUAD ' + (n + 1));
      const chips = byIndex[gi].map(chipFor).join('');
      const t = tracks[gi] || { title: '—' };
      return `<div class="reveal-squad ${mine ? 'mine' : 'other'}">
        <div class="reveal-squad-head">
          <span class="reveal-squad-tag">${tag}</span>
        </div>
        <div class="reveal-squad-members">${chips}</div>
        <div class="reveal-squad-song">${REVEAL_NOTE_SVG}<span>${escapeHtml(t.title || '—')}</span></div>
      </div>`;
    }).join('');
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
  // AUDIO-BLOCKED OVERLAY
  // ------------------------------------------------------------
  // Shown when the browser's autoplay policy rejects play() at round
  // start. Stays up until the 'playing' event fires, so it can't be
  // missed. The tap re-seeks to the shared startAt offset, so a late
  // unmute still lands in sync with every other device.
  // ============================================================
  function showAudioOverlay() { $('audio-overlay').classList.add('open'); }
  function hideAudioOverlay() { $('audio-overlay').classList.remove('open'); }

  $('audio-overlay').addEventListener('click', () => {
    const meta = state.meta || {};
    const audio = state.audio;
    if (meta.startAt) {
      const o = Math.max(0, (nowSync() - meta.startAt) / 1000);
      try { audio.currentTime = o; } catch(e){}
    }
    audio.play().catch(()=>{});
  });
  state.audio.addEventListener('playing', hideAudioOverlay);

  // ============================================================
  // AUDIO UNLOCK
  // ============================================================
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    const a = state.audio;
    try {
      a.muted = true;
      const p = a.play();
      if (p && p.then) {
        p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
         .catch(() => { a.muted = false; });
      } else {
        a.pause(); a.muted = false;
      }
    } catch(e) {
      a.muted = false;
    }
  }

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
  //   games/   — a real game was PLAYED (every play/replay counts)
  //     games/total
  //     games/modes/<mode>                  ('category' | 'hostPicks' | 'findSquad' | 'partnerHunt')
  //     games/countries/<ISO code>          (the host's country)
  //     games/categories/<name>, games/songs/<title>  (songs skipped for group modes)
  //     games/daily/<YYYY-MM-DD>/{count, countries/<ISO code>, categories/<name>, songs/<title>}
  //
  //   interest/ — demand signal for unreleased modes (deduped per device)
  //     interest/partnerHunt, interest/daily/<YYYY-MM-DD>/partnerHunt
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
  // room code or user id. Lets a silent breakage (a song that won't load, a
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
  // A round only starts with enough players in the room, so each call here
  // means "a real game was played" — and every play/replay counts. The host's
  // country is recorded under games/countries/* so you can see where games
  // actually happen, separate from visits/* which counts app opens.
  // `mode` splits rounds under games/modes/* ('category' | 'hostPicks').
  // Category counters only make sense in category mode; hostPicks rounds
  // still bump games/songs/* (with the host-picked crew song) so the songs
  // leaderboard stays meaningful.
  async function trackRound(category, song, mode) {
    if (!analyticsEnabled()) return;
    const day = todayKey();
    const m = safeKey(mode || 'category');
    const u = {
      'games/total': 1,
      [`games/modes/${m}`]: 1,
      [`games/daily/${day}/count`]: 1,
      [`games/daily/${day}/modes/${m}`]: 1,
    };
    // The single-song leaderboard only makes sense when a round has one
    // shared song. Group modes play several songs at once, so skip it there.
    if (!isGroupMode(mode)) {
      const sng = safeKey(song);
      u[`games/songs/${sng}`] = 1;
      u[`games/daily/${day}/songs/${sng}`] = 1;
    }
    if (mode !== 'hostPicks') {
      const cat = safeKey(category);
      u[`games/categories/${cat}`] = 1;
      u[`games/daily/${day}/categories/${cat}`] = 1;
    }
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
