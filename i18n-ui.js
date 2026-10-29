'use strict';
// Language: the island in English (default) or Bahasa Melayu (ms). Settings → General → Language.
// The app's own text is written in English. In Bahasa Melayu, every text drawn on the canvas goes through
// text(), and every DOM page is watched, so all screens are translated in one place.
// Unknown texts (your own notes, Claude's messages, file names) stay as they are.
(function i18n() {
  const lang = () => (window.__kopiPrefs?.().lang === 'ms' ? 'ms' : 'en');
  window.__kopiLang = lang;
  window.__kopiLocale = () => (lang() === 'ms' ? 'ms-MY' : 'en-GB');

  const EXACT = {
    // states and labels
    'Working': 'Sedang bekerja', 'Working…': 'Sedang bekerja…', 'Working ·': 'Sedang bekerja ·', 'Sending': 'Menghantar', 'Question': 'Soalan',
    'Error': 'Ralat', 'Stopped': 'Berhenti', 'Unavailable': 'Tidak tersedia', 'Done': 'Siap', 'Ready': 'Sedia', 'Connecting': 'Menyambung',
    'Not connected': 'Tidak disambungkan', 'Not connected yet': 'Belum disambungkan', 'Connected': 'Disambungkan', 'Log in': 'Log masuk',
    'Sign in first': 'Log masuk dahulu', 'Log in first': 'Log masuk dahulu', 'Idle': 'Rehat', 'idle': 'rehat', 'Not active': 'Tidak aktif',
    'Waiting for you': 'Menunggu anda', '● Waiting for you': '● Menunggu anda', '✓ Done': '✓ Siap', '✕ Stopped with an error': '✕ Berhenti kerana ralat',
    'Stopped with an error': 'Berhenti kerana ralat', 'Waiting for Claude Code': 'Menunggu Claude Code', 'Waiting for Codex': 'Menunggu Codex',
    'Waiting for your AI': 'Menunggu AI anda', 'Claude is working': 'Claude sedang bekerja', 'Claude working': 'Claude bekerja',
    'Needs permission': 'Perlu kebenaran', 'Needs permission: answer in Codex': 'Perlu kebenaran: jawab dalam Codex', 'Plan ready': 'Pelan siap',
    'Has a question for you': 'Ada soalan untuk anda', 'Claude has a question for you': 'Claude ada soalan untuk anda',
    'Claude Code needs you.': 'Claude Code memerlukan anda.', 'Claude needs you in the terminal.': 'Claude memerlukan anda di terminal.',
    'Allowed, continuing': 'Dibenarkan, meneruskan', 'Denied': 'Ditolak', 'Seen': 'Dilihat', 'Your answer was sent': 'Jawapan anda telah dihantar',
    'Claude is overloaded': 'Claude terlalu sibuk', 'not logged in': 'belum log masuk', 'answer too long': 'jawapan terlalu panjang', 'limit reached': 'had dicapai',
    'Running a command': 'Menjalankan arahan', 'Searching the code': 'Mencari dalam kod', 'Searching the web': 'Mencari di web', 'Starting a helper': 'Memulakan pembantu',
    'Claude asks something': 'Claude bertanya sesuatu', 'Plan ready: approve?': 'Pelan siap: luluskan?', 'Something went wrong': 'Ada yang tidak kena',
    'Error: limit reached': 'Ralat: had dicapai', 'Ready for your question': 'Sedia untuk soalan anda', 'Choose an answer': 'Pilih jawapan',
    'Editing files': 'Menyunting fail', 'No active session': 'Tiada sesi aktif', 'Following this chat': 'Mengikuti sembang ini',
    'Answer ready': 'Jawapan sedia', 'Writing the answer': 'Menulis jawapan', 'Checking the connection': 'Menyemak sambungan',
    'Checking the new answer': 'Menyemak jawapan baharu', 'Checking the end of the answer': 'Menyemak penghujung jawapan',
    'Question in the latest answer': 'Soalan dalam jawapan terakhir', 'Ready · window connected': 'Sedia · tetingkap disambungkan', 'Answer stopped': 'Jawapan dihentikan',
    'Connect your conversation': 'Sambungkan sembang anda', 'Coming soon': 'Akan datang',
    // permission
    'Allow': 'Benarkan', 'Deny': 'Tolak', 'View': 'Lihat', 'May I do this?': 'Boleh saya buat ini?', 'Approve': 'Luluskan', 'Change': 'Ubah',
    // header / home / widgets
    'Apps': 'Aplikasi', 'Widgets': 'Widget', 'Tray': 'Dulang', 'Clipboard': 'Papan keratan', 'Note': 'Nota', 'Settings': 'Tetapan', 'Clock': 'Jam',
    'Music': 'Muzik', 'Devices': 'Peranti', 'Focus': 'Fokus', 'Mirror': 'Cermin', 'Home': 'Utama', 'Island': 'Island', 'Empty': 'Kosong',
    '🔇 Sound off': '🔇 Bunyi dimatikan', 'Write it down': 'Tulis', 'Last copies': 'Salinan terakhir', 'Your last copies': 'Salinan terakhir anda',
    'Colours, sound': 'Warna, bunyi', 'Colours, sound and more': 'Warna, bunyi dan banyak lagi', 'Jot something down': 'Catat sesuatu',
    'Nothing playing': 'Tiada yang dimainkan', 'Nothing is playing': 'Tiada yang dimainkan', 'opens Rehatt anywhere': 'membuka Rehatt di mana-mana', 'TIP': 'TIP',
    'Everything Rehatt can do · Ctrl+Alt+1–6 = shortcut': 'Semua yang Rehatt boleh buat · Ctrl+Alt+1–6 = pintasan',
    'Tap to write something down': 'Ketik untuk mencatat sesuatu', 'Copy something and it shows up here': 'Salin sesuatu dan ia muncul di sini',
    'Drag to move  ·  + for new widgets': 'Seret untuk alih  ·  + untuk widget baharu', 'Pick an app and a size, or a ready-made layout': 'Pilih aplikasi dan saiz, atau susun atur siap',
    'Small': 'Kecil', 'Wide': 'Lebar', 'Large': 'Besar', 'Standard': 'Standard', '2 large': '2 besar', '8 small': '8 kecil', '4 wide': '4 lebar',
    'No room': 'Tiada ruang', 'No room to make it bigger': 'Tiada ruang untuk membesarkannya', 'Already there': 'Sudah ada', 'Add': 'Tambah',
    'Max 4 · remove one first': 'Maksimum 4 · buang satu dahulu', 'Shortcuts': 'Pintasan', 'Your favourite apps': 'Aplikasi kegemaran anda',
    'Edit': 'Ubah', 'Rehatt follows it by itself': 'Rehatt mengikutinya sendiri', 'Start focus': 'Mula fokus', 'Ready to start': 'Sedia untuk bermula',
    'Stay focused': 'Kekal fokus', 'Stay focused, Kopi is watching': 'Kekal fokus, Kopi memerhati', 'Focus running': 'Fokus berjalan', 'Today': 'Hari ini',
    // Spotify
    'Connect Spotify': 'Sambungkan Spotify', 'Playing now': 'Sedang dimainkan', 'Play on': 'Main pada', 'This PC': 'PC ini', '⏮  Previous song': '⏮  Lagu sebelumnya',
    '⏭  Next song': '⏭  Lagu seterusnya', "Couldn't load your devices.": 'Peranti anda tidak dapat dimuatkan.', 'Open Spotify on another device to see it here.': 'Buka Spotify pada peranti lain untuk melihatnya di sini.',
    'Start music in Spotify, or press play.': 'Mainkan muzik dalam Spotify, atau tekan main.', 'Then you see and control your music here.': 'Kemudian anda boleh lihat dan kawal muzik anda di sini.',
    'No music playing': 'Tiada muzik dimainkan', 'Open Spotify and start some music': 'Buka Spotify dan mainkan muzik', 'Computer': 'Komputer', 'Smartphone': 'Telefon pintar', 'Speaker': 'Pembesar suara',
    // Claude Code page
    'Summary': 'Ringkasan', 'Changed': 'Diubah', 'No files touched': 'Tiada fail disentuh', 'Plan': 'Pelan', 'What should change?': 'Apa yang perlu diubah?',
    'Or type your own answer…': 'Atau taip jawapan anda sendiri…', 'Send': 'Hantar', 'Send (Enter)': 'Hantar (Enter)', 'Your answer…': 'Jawapan anda…',
    'Type something for Claude…': 'Taip sesuatu untuk Claude…', 'Message to Claude Code': 'Mesej kepada Claude Code', '5-hour limit': 'Had 5 jam',
    'Check the terminal to see what went wrong.': 'Lihat di terminal apa yang tidak kena.', 'To terminal': 'Ke terminal', 'Default': 'Lalai',
    'Which model does Claude use?': 'Model mana yang Claude guna?', 'What Claude Code picks itself': 'Apa yang Claude Code pilih sendiri',
    'The smartest, for hard jobs': 'Paling bijak, untuk kerja sukar', 'Fast and smart, for most things': 'Pantas dan bijak, untuk kebanyakan kerja',
    'Super fast, for small things': 'Sangat pantas, untuk kerja kecil', 'Opus plans, Sonnet builds': 'Opus merancang, Sonnet membina',
    'Choose which Claude model Claude Code uses': 'Pilih model Claude yang digunakan oleh Claude Code', 'Read': 'Dibaca', 'Edited': 'Disunting', 'Ran': 'Dijalankan',
    'Searched': 'Dicari', 'Searched the web': 'Dicari di web', 'Helper done': 'Pembantu siap', 'Helper working': 'Pembantu bekerja', 'Reading': 'Membaca',
    'Editing': 'Menyunting', 'Running': 'Menjalankan', 'Searching': 'Mencari',
    // Connections and AI settings (island)
    'Open Connections': 'Buka Sambungan', 'Open chat': 'Buka sembang', 'Refresh': 'Muat semula', 'Back': 'Kembali', 'Reconnect': 'Sambung semula', 'Disconnect': 'Putuskan',
    'Connect ChatGPT': 'Sambungkan ChatGPT', 'Sign in with ChatGPT': 'Log masuk dengan ChatGPT', 'Sign out': 'Log keluar', 'Cancel sign-in': 'Batalkan log masuk',
    'Other account': 'Akaun lain', 'Connected to ChatGPT': 'Disambungkan ke ChatGPT', 'Use your ChatGPT account': 'Gunakan akaun ChatGPT anda',
    'Your own API key': 'Kunci API anda sendiri', 'Own OpenAI': 'OpenAI sendiri', 'Local AI': 'AI tempatan', 'For example Ollama': 'Contohnya Ollama',
    'Recommended': 'Disyorkan', 'Set': 'Ditetapkan', 'Set up': 'Tetapkan', 'Test connection': 'Uji sambungan', 'Developer settings': 'Tetapan pembangun',
    'Developer key': 'Kunci pembangun', 'API key': 'Kunci API', 'Save key': 'Simpan kunci', 'Remove key': 'Buang kunci', 'Save model': 'Simpan model',
    'Key saved securely.': 'Kunci disimpan dengan selamat.', 'Key removed.': 'Kunci dibuang.', 'Model saved.': 'Model disimpan.', 'Enter a key first.': 'Masukkan kunci dahulu.',
    'Connection works.': 'Sambungan berfungsi.', 'You are signed out.': 'Anda telah log keluar.', 'Your key is saved securely.': 'Kunci anda disimpan dengan selamat.',
    'ChatGPT is connected. You can go back to Project.': 'ChatGPT disambungkan. Anda boleh kembali ke Projek.', 'Choose the AI your assistant should use.': 'Pilih AI yang patut digunakan oleh pembantu anda.',
    'Use your own key. Usage is billed to your API account.': 'Gunakan kunci anda sendiri. Penggunaan dicaj ke akaun API anda.',
    'Uses an OpenAI key from your developer environment.': 'Menggunakan kunci OpenAI daripada persekitaran pembangun anda.',
    'Log in on the official page in your browser and choose your workspace.': 'Log masuk di halaman rasmi dalam pelayar anda dan pilih ruang kerja anda.',
    'Finish signing in in your browser.': 'Selesaikan log masuk dalam pelayar anda.', 'Install Codex once in your project folder:': 'Pasang Codex sekali dalam folder projek anda:',
    'The AI settings could not be saved.': 'Tetapan AI tidak dapat disimpan.', 'This request failed.': 'Permintaan ini gagal.',
    'New key; the existing key is not shown': 'Kunci baharu; kunci sedia ada tidak ditunjukkan', 'Make Rehatt all yours': 'Jadikan Rehatt milik anda sepenuhnya',
    // island settings: Character
    'Name': 'Nama', 'What’s his name?': 'Siapa namanya?', 'He says it when he says hi': 'Dia menyebutnya apabila dia menyapa', 'Save': 'Simpan', 'Look': 'Rupa',
    'Eye colour': 'Warna mata', 'When nothing is going on': 'Apabila tiada apa-apa berlaku', 'Cup colour': 'Warna cawan', 'Pick what suits him': 'Pilih yang sesuai dengannya',
    'Traffic-light eyes': 'Mata lampu isyarat', 'Pick your own colour for every state. Click the block to test it.': 'Pilih warna anda sendiri untuk setiap keadaan. Klik blok untuk mengujinya.',
    'Working or a question': 'Bekerja atau ada soalan', 'Classic': 'Klasik', 'Soft': 'Lembut', 'Colour-blind': 'Buta warna', 'Outfit': 'Pakaian', 'Best': 'Terbaik', 'None': 'Tiada',
    'Festive outfits': 'Pakaian perayaan', 'Songkok for Hari Raya, a red bow for Chinese New Year, Santa hat, witch hat': 'Songkok untuk Hari Raya, reben merah untuk Tahun Baru Cina, topi Santa, topi ahli sihir',
    'Behaviour · click a block to see it': 'Kelakuan · klik blok untuk melihatnya', 'Faces': 'Wajah', 'Happy, sad, curious, focused': 'Gembira, sedih, ingin tahu, fokus',
    'See his moods': 'Lihat emosinya', 'Click one to see it': 'Klik satu untuk melihatnya', 'Blinking': 'Berkelip', 'He blinks now and then': 'Dia berkelip sekali-sekala',
    'Dancing to music': 'Menari mengikut muzik', 'Moves along when Spotify plays': 'Bergerak bersama apabila Spotify dimainkan', 'Sleep effect': 'Kesan tidur',
    'He falls asleep when nothing happens for a while': 'Dia tertidur apabila tiada apa berlaku buat seketika', 'Fall asleep after': 'Tertidur selepas',
    'When nothing happens (Sleep effect must be on)': 'Apabila tiada apa berlaku (Kesan tidur mesti hidup)', 'Startup animation': 'Animasi permulaan',
    'Wave and say "hi" at startup': 'Melambai dan berkata "hai" semasa bermula', 'Hunger': 'Lapar',
    'His cup slowly empties when you go a long time without finishing a task': 'Cawannya perlahan-lahan kosong apabila lama anda tidak menyiapkan tugasan',
    'Not earned yet': 'Belum diperoleh', 'Party hat': 'Topi parti', 'party hat': 'topi parti', 'Good Morning towel': 'Tuala Good Morning', 'Sunglasses': 'Cermin mata hitam', 'Crown': 'Mahkota',
    '😊 Happy': '😊 Gembira', '😍 In love': '😍 Jatuh cinta', '😮 Surprised': '😮 Terkejut', '🤔 Curious': '🤔 Ingin tahu', '🧐 Focused': '🧐 Fokus', '😉 Wink': '😉 Kenyit',
    '😢 Sad': '😢 Sedih', '😵 Dizzy': '😵 Pening', '😴 Sleepy': '😴 Mengantuk',
    // badges
    'First task': 'Tugasan pertama', 'Claude Code finishes a task': 'Claude Code menyiapkan tugasan', 'Ten tasks': 'Sepuluh tugasan', '10 tasks done': '10 tugasan siap',
    'Fifty tasks': 'Lima puluh tugasan', '50 tasks done': '50 tugasan siap', 'Helpful': 'Suka membantu', 'Answered 10 times from the island': 'Menjawab 10 kali dari island',
    'Night owl': 'Burung hantu', 'A task done after midnight': 'Tugasan siap selepas tengah malam', 'Early bird': 'Bangun awal', 'A task done before 7 am': 'Tugasan siap sebelum 7 pagi',
    'Marathon': 'Maraton', 'A task of more than 15 minutes': 'Tugasan lebih daripada 15 minit', 'Focus master': 'Pakar fokus', '5 focus blocks finished': '5 blok fokus disiapkan',
    'DJ': 'DJ', 'Controlled Spotify 10 times from the island': 'Mengawal Spotify 10 kali dari island', 'Collector': 'Pengumpul', '5 files in the tray': '5 fail dalam dulang',
    'Looking good': 'Nampak segak', 'Used the mirror': 'Menggunakan cermin', 'Fashion icon': 'Ikon fesyen', 'Earned every outfit': 'Memperoleh semua pakaian',
    'Achievements': 'Pencapaian', 'Achievement': 'Pencapaian',
    // island settings: General
    'Language': 'Bahasa', 'Language · Bahasa': 'Bahasa · Language', 'The language of the island': 'Bahasa island', 'English': 'English', 'Bahasa Melayu': 'Bahasa Melayu',
    'Testing': 'Ujian', 'Test mode': 'Mod ujian', 'Buttons to try everything without real Claude or music': 'Butang untuk mencuba semuanya tanpa Claude atau muzik sebenar',
    'Animations': 'Animasi', 'Speed': 'Kelajuan', 'How fast the island opens, closes and reacts': 'Berapa pantas island dibuka, ditutup dan bertindak balas', 'Fast': 'Pantas', 'Normal': 'Biasa',
    'App animations': 'Animasi aplikasi', 'Kopi does a little trick when you open an app': 'Kopi buat helah kecil apabila anda membuka aplikasi', 'Confetti': 'Konfeti',
    'For long tasks, finished focus and new outfits': 'Untuk tugasan panjang, fokus yang siap dan pakaian baharu', 'Focus & notifications': 'Fokus & pemberitahuan',
    'Traffic-light sounds': 'Bunyi lampu isyarat', 'Ding when done, pling for a question, low for an error': 'Ding apabila siap, pling untuk soalan, rendah untuk ralat',
    'Windows notifications': 'Pemberitahuan Windows', 'Notification for done, question, focus and limit': 'Pemberitahuan untuk siap, soalan, fokus dan had',
    'Warn at limit': 'Amaran pada had', 'Notify when you used this much of your 5-hour limit': 'Beritahu apabila anda sudah guna sebanyak ini daripada had 5 jam anda', 'Never': 'Tidak sekali-kali',
    'Sound pack': 'Pek bunyi', 'How the traffic-light sounds sound (click to hear)': 'Bagaimana bunyi lampu isyarat kedengaran (klik untuk dengar)', 'Bells': 'Loceng',
    'Weather': 'Cuaca', 'Type your city to see the weather on the home screen': 'Taip bandar anda untuk melihat cuaca di skrin utama', 'Calendar': 'Kalendar',
    'Connected: your next event shows on the home screen': 'Disambungkan: acara anda yang seterusnya muncul di skrin utama',
    'Google Calendar: Settings → your calendar → "Secret address in iCal format". Paste that link here.': 'Google Calendar: Tetapan → kalendar anda → "Alamat rahsia dalam format iCal". Tampal pautan itu di sini.',
    'Volume bar': 'Bar kelantangan', 'Shows the volume in the island when you change it': 'Menunjukkan kelantangan dalam island apabila anda mengubahnya',
    'Battery warning': 'Amaran bateri', 'Laptop and Bluetooth (headphones, mouse) almost empty': 'Komputer riba dan Bluetooth (fon kepala, tetikus) hampir habis',
    'Reset everything': 'Set semula semuanya', 'Set all these choices back to default': 'Kembalikan semua pilihan ini kepada lalai', 'Reset': 'Set semula',
    'Start with Windows': 'Mula bersama Windows', 'Rehatt starts by itself when you turn on your PC': 'Rehatt bermula sendiri apabila anda menghidupkan PC',
    'Restart': 'Mula semula', 'Closes Rehatt and starts it again right away': 'Menutup Rehatt dan memulakannya semula dengan segera', 'Quit': 'Keluar',
    'Quits Rehatt completely. Also possible via Kopi next to the clock.': 'Keluar sepenuhnya dari Rehatt. Juga boleh melalui Kopi di sebelah jam.',
    'Quit Rehatt?': 'Keluar dari Rehatt?', 'Yes, quit': 'Ya, keluar', 'No': 'Tidak', 'On': 'Hidup', 'Off': 'Mati', 'General': 'Umum', 'Character': 'Watak',
    '👋 Start up': '👋 Mula', '😴 Shut down': '😴 Tutup', '🟠 Claude working': '🟠 Claude bekerja', '❓ Claude asks': '❓ Claude bertanya', '🟢 Claude done': '🟢 Claude siap',
    '🔴 Claude error': '🔴 Ralat Claude', '🎵 Fake music': '🎵 Muzik palsu', '⏱️ Focus 1 min': '⏱️ Fokus 1 min', '🧹 Stop everything': '🧹 Hentikan semua',
    'E.g. Puchong': 'Cth. Puchong', 'Type here…': 'Taip di sini…',
    // focus, tray, clipboard, note, mirror
    'Choose how long you want to focus': 'Pilih berapa lama anda mahu fokus', 'You are focusing. Rehatt keeps the time.': 'Anda sedang fokus. Rehatt menjaga masa.',
    'Music and Claude stay visible in the small island.': 'Muzik dan Claude kekal kelihatan dalam island kecil.', 'Stop': 'Henti', 'Hours': 'Jam', 'Minutes': 'Minit', 'Seconds': 'Saat',
    '1 hour': '1 jam', 'Focus done!': 'Fokus siap!', 'Drag a file out, or click to open it': 'Seret fail keluar, atau klik untuk membukanya',
    'Drop files on the island to keep them for a bit': 'Letakkan fail pada island untuk menyimpannya sebentar', 'Your tray is empty': 'Dulang anda kosong',
    'Drag a file onto Rehatt to keep it for a bit': 'Seret fail ke atas Rehatt untuk menyimpannya sebentar', 'Let go, I’ll catch it!': 'Lepaskan, saya tangkap!',
    '🧺 Let go, I’ll catch it!': '🧺 Lepaskan, saya tangkap!', 'In your tray': 'Dalam dulang anda', 'The file goes into your tray': 'Fail masuk ke dalam dulang anda',
    'Your last copied text · click to copy it again': 'Teks terakhir yang anda salin · klik untuk menyalinnya semula', 'Clear': 'Kosongkan',
    'Nothing copied yet': 'Belum ada yang disalin', 'Copy something (Ctrl + C) and it shows up here.': 'Salin sesuatu (Ctrl + C) dan ia muncul di sini.',
    'Jot something down · saved automatically': 'Catat sesuatu · disimpan secara automatik', 'Copied ✓': 'Disalin ✓',
    'A quick check before your video call · the camera stops when you leave': 'Semakan pantas sebelum panggilan video · kamera berhenti apabila anda keluar',
    'Plug in your charger.': 'Sambungkan pengecas anda.', 'Take it easy for a bit.': 'Perlahan-lahan sedikit.', 'In 10 minutes': 'Dalam 10 minit', 'Event': 'Acara',
    // project mode
    'How can I help?': 'Apa yang boleh saya bantu?', 'Assistant': 'Pembantu', 'Project': 'Projek', 'Search': 'Cari', 'For example:': 'Contohnya:', '← Results': '← Hasil',
    'Choose project folder': 'Pilih folder projek', 'Other folder': 'Folder lain', 'Choose folder': 'Pilih folder', 'No project chosen yet': 'Belum ada projek dipilih',
    'Rehatt only reads the folder you choose.': 'Rehatt hanya membaca folder yang anda pilih.', 'Scanning project...': 'Mengimbas projek...',
    'Opening file...': 'Membuka fail...', 'Fetching the real local code...': 'Mengambil kod tempatan sebenar...', 'Searching the code...': 'Mencari dalam kod...',
    'This was read straight from your local project.': 'Ini dibaca terus dari projek tempatan anda.', 'Sound effects': 'Kesan bunyi', 'Undo': 'Buat asal',
    'Connect a project': 'Sambungkan projek', 'PROJECT · WHOLE FOLDER': 'PROJEK · SELURUH FOLDER', 'What do you want to change?': 'Apa yang anda mahu ubah?',
    'Connect your project folder': 'Sambungkan folder projek anda', 'Open Settings → AI': 'Buka Tetapan → AI', 'Checking the project…': 'Menyemak projek…',
    'Describe your idea. Rehatt picks the right files itself, opens them in VS Code and carries out your request.': 'Terangkan idea anda. Rehatt memilih fail yang betul sendiri, membukanya dalam VS Code dan melaksanakan permintaan anda.',
    'Choose one local folder. Then you talk with Rehatt about the whole project.': 'Pilih satu folder tempatan. Kemudian anda berbual dengan Rehatt tentang seluruh projek.',
    'For example: make the Spotify bar calmer': 'Contohnya: jadikan bar Spotify lebih tenang', '✓ Changes saved': '✓ Perubahan disimpan', '✓ Analysis done': '✓ Analisis siap',
    '✓ Previous job undone': '✓ Kerja sebelumnya dibuat asal', 'The job was stopped.': 'Kerja itu dihentikan.', 'Undo was stopped.': 'Buat asal dihentikan.',
    'Checking backups…': 'Menyemak sandaran…', 'Progress of the steps': 'Kemajuan langkah',
    // tests (demo prompts)
    'Make the button on the homepage blue': 'Jadikan butang di halaman utama berwarna biru', 'Make the button look nicer': 'Jadikan butang lebih cantik',
    'Put the website online': 'Letakkan laman web dalam talian', 'Fix the SST calculation': 'Betulkan pengiraan SST',
    // more screen text and common messages
    "Let go, I'll catch it!": 'Lepaskan, saya tangkap!', "That didn't work.": 'Tidak berjaya.', 'Done ✓': 'Siap ✓', 'Later': 'Nanti', 'Automobile': 'Kereta',
    'Search failed.': 'Carian gagal.', 'First type what you want to search for.': 'Taip dahulu apa yang anda mahu cari.',
    'I didn’t find relevant code for this yet.': 'Saya belum jumpa kod yang berkaitan untuk ini.', 'Searching the project failed.': 'Carian dalam projek gagal.',
    'Opening VS Code failed.': 'Membuka VS Code gagal.', 'Choosing the project folder failed.': 'Memilih folder projek gagal.', 'The AI interface comes here.': 'Antara muka AI akan berada di sini.',
    'The project could not be loaded.': 'Projek tidak dapat dimuatkan.', 'The project chat could not be loaded.': 'Sembang projek tidak dapat dimuatkan.',
    'The project could not be opened.': 'Projek tidak dapat dibuka.', 'The project could not be scanned again.': 'Projek tidak dapat diimbas semula.',
    'The file could not be read.': 'Fail tidak dapat dibaca.', 'Tip: Ctrl + Alt + 1–6 also opens apps from the keyboard': 'Tip: Ctrl + Alt + 1–6 juga membuka aplikasi dengan papan kekunci',
    'Ouch! Too many taps… need a sec 😵': 'Aduh! Terlalu banyak cucuk… pening sekejap 😵', 'My cup’s empty… finish a task ☕': 'Cawan saya kosong… siapkan satu tugasan ☕',
    'Choose an answer for every question.': 'Pilih jawapan untuk setiap soalan.', 'Choose allow or deny.': 'Pilih benarkan atau tolak.',
    'Claude Code is no longer waiting for an answer. Type it in the terminal.': 'Claude Code tidak lagi menunggu jawapan. Taipkannya di terminal.',
    'This question was already answered, maybe in the terminal.': 'Soalan ini sudah dijawab, mungkin di terminal.', 'This plan was already answered, maybe in the terminal.': 'Pelan ini sudah dijawab, mungkin di terminal.',
    'There is no open question any more.': 'Tiada lagi soalan terbuka.', 'There is no open plan any more.': 'Tiada lagi pelan terbuka.',
    'Type an answer of at most 5000 characters.': 'Taip jawapan tidak lebih daripada 5000 aksara.', 'Not available.': 'Tidak tersedia.',
    'Rehatt is still starting up.': 'Rehatt masih bermula.', 'The terminal window was not found. Is it still open?': 'Tetingkap terminal tidak dijumpai. Adakah ia masih terbuka?',
    'Windows didn’t let Rehatt bring the window to the front. Click the terminal in your taskbar.': 'Windows tidak membenarkan Rehatt membawa tetingkap ke hadapan. Klik terminal pada bar tugas anda.',
    'Rehatt doesn’t know yet which window belongs to this session. He learns it after Claude’s first answer.': 'Rehatt belum tahu tetingkap mana milik sesi ini. Dia akan tahu selepas jawapan pertama Claude.',
    'The answer could not be sent.': 'Jawapan tidak dapat dihantar.', 'Sending not confirmed. Check the chat before you send again.': 'Penghantaran tidak disahkan. Semak sembang sebelum menghantar semula.',
    'Connect Claude Code or Codex first, then I can answer.': 'Sambungkan Claude Code atau Codex dahulu, kemudian saya boleh menjawab.',
    'Spotify is not set up in this build yet.': 'Spotify belum disediakan dalam binaan ini.', 'Spotify is not connected yet.': 'Spotify belum disambungkan.',
    'Spotify needs to be connected again.': 'Spotify perlu disambungkan semula.', 'Switching devices needs Spotify Premium.': 'Menukar peranti memerlukan Spotify Premium.',
    'Connecting Spotify failed.': 'Menyambungkan Spotify gagal.', 'City not found.': 'Bandar tidak dijumpai.', 'Paste an https or webcal link of your calendar.': 'Tampal pautan https atau webcal kalendar anda.',
    'This file is not in the tray.': 'Fail ini tiada dalam dulang.', 'AI is not set up yet. Go to Settings → AI.': 'AI belum disediakan. Pergi ke Tetapan → AI.',
    'AI is not set up yet. Open Settings → AI.': 'AI belum disediakan. Buka Tetapan → AI.', 'First choose your AI in Settings → AI.': 'Pilih AI anda dahulu dalam Tetapan → AI.',
    'Choose a project folder first.': 'Pilih folder projek dahulu.', 'Choose a project first.': 'Pilih projek dahulu.', 'The project folder no longer exists.': 'Folder projek sudah tiada.',
    'First sign in via Settings → AI → ChatGPT.': 'Log masuk dahulu melalui Tetapan → AI → ChatGPT.', 'The ChatGPT sign-in was cancelled.': 'Log masuk ChatGPT dibatalkan.',
    'Click Sign in to try again.': 'Klik Log masuk untuk mencuba lagi.', 'Codex took too long.': 'Codex mengambil masa terlalu lama.', 'Codex gave no answer.': 'Codex tidak memberi jawapan.',
    'Claude took too long. Try again.': 'Claude mengambil masa terlalu lama. Cuba lagi.', 'Sign in with ChatGPT once, then Codex can answer.': 'Log masuk dengan ChatGPT sekali, kemudian Codex boleh menjawab.',
    // colours (swatch names)
    'cloud': 'awan', 'mint': 'pudina', 'sky': 'langit', 'rose': 'mawar', 'classic': 'klasik', 'night': 'malam', 'blue': 'biru', 'purple': 'ungu', 'pink': 'merah jambu',
    'gold': 'emas', 'white': 'putih', 'yellow': 'kuning'
  };
  const PATTERNS = [
    [/^Reading a file$/, 'Membaca fail'], [/^Reading (.+)$/, 'Membaca $1'], [/^Editing a file$/, 'Menyunting fail'], [/^Editing (.+)$/, 'Menyunting $1'],
    [/^Using (.+)$/, 'Menggunakan $1'], [/^(.+) is working$/, '$1 sedang bekerja'], [/^(.+) asks something$/, '$1 bertanya sesuatu'], [/^(.+) made a plan\.$/, '$1 membuat pelan.'],
    [/^(.+) needs you\.$/, '$1 memerlukan anda.'], [/^Waiting for (.+)$/, 'Menunggu $1'], [/^Error: (.+)$/, (m, a) => `Ralat: ${tr(a)}`],
    [/^(.+) has a question$/, '$1 ada soalan'], [/^(.+) is done$/, '$1 siap'], [/^Claude Code: error$/, 'Claude Code: ralat'],
    [/^(\d+) min$/, '$1 min'], [/^(\d+) files…$/, '$1 fail…'], [/^(\d+) tasks done$/, '$1 tugasan siap'], [/^(\d+) sessions$/, '$1 sesi'],
    [/^(\d+) tasks done · (\d+)\/(\d+) badges$/, '$1 tugasan siap · $2/$3 pencapaian'], [/^Now: (.+)$/, 'Sekarang: $1'], [/^Project: (.+)$/, 'Projek: $1'],
    [/^Remove (.+) from the tray$/, 'Keluarkan $1 dari dulang'], [/^Battery almost empty: (\d+)%$/, 'Bateri hampir habis: $1%'], [/^(.+) is almost empty$/, '$1 hampir habis'],
    [/^(\d+)% battery left\.$/, 'Bateri tinggal $1%.'], [/^Switching to (.+)…$/, 'Bertukar ke $1…'], [/^Playing on (.+)$/, 'Dimainkan pada $1'],
    [/^Stopped · (.+)$/, (m, a) => `Berhenti · ${tr(a)}`], [/^(\d+)% of steps · (\d+)s$/, '$1% langkah · $2s'],
    [/^(Working or a question|Done|Error): (#\w+)$/, (m, a, b) => `${tr(a)}: ${b}`]
  ];
  function translate(t) {
    if (Object.prototype.hasOwnProperty.call(EXACT, t)) return EXACT[t];
    for (const [re, rep] of PATTERNS) if (re.test(t)) return t.replace(re, rep);
    // made of parts, like "Claude · Working" or "ChatGPT: Not connected. Claude Code: Done"
    if (t.length > 120) return null; // long texts (Claude's messages, your notes) are never split up
    for (const sep of [' · ', '. ', ': ']) {
      if (!t.includes(sep)) continue;
      const parts = t.split(sep), out = parts.map(p => translate(p) ?? (sep === '. ' ? translate(p + '.')?.replace(/\.$/, '') : null));
      if (out.some((o, i) => o != null && o !== parts[i])) return out.map((o, i) => o ?? parts[i]).join(sep);
    }
    return null;
  }
  function tr(s) {
    if (lang() !== 'ms' || typeof s !== 'string') return s;
    const t = s.trim(); if (!t) return s;
    const out = translate(t);
    return out == null ? s : s.replace(t, out);
  }
  window.__kopiTr = tr;

  // ---- canvas: everything drawn with text() ----
  const baseText = text;
  text = function (value, ...rest) { return baseText(typeof value === 'string' ? tr(value) : value, ...rest); };

  // ---- DOM pages: translate text and labels, remember the English to switch back ----
  const SKIP = 'script,style,textarea,input,.tl-clip,.tl-list';
  const original = new WeakMap(), ATTRS = ['placeholder', 'title', 'aria-label'];
  let applying = false;
  function fixNode(node) {
    if (node.nodeType === 3) {
      if (!node.parentElement || node.parentElement.closest(SKIP)) return;
      const value = node.nodeValue, known = original.get(node);
      const source = known && known.shown === value ? known.src : value;
      const want = lang() === 'ms' ? tr(source) : source;
      if (want !== value) { node.nodeValue = want; }
      if (want !== source) original.set(node, { src: source, shown: want }); else original.delete(node);
      return;
    }
    if (node.nodeType !== 1 || node.closest?.('script,style')) return;
    for (const a of ATTRS) {
      if (!node.hasAttribute(a)) continue;
      const key = 'data-src-' + a, value = node.getAttribute(a);
      const source = node.hasAttribute(key) && node.getAttribute(key + '-shown') === value ? node.getAttribute(key) : value;
      const want = lang() === 'ms' ? tr(source) : source;
      if (want !== value) node.setAttribute(a, want);
      if (want !== source) { node.setAttribute(key, source); node.setAttribute(key + '-shown', want); } else { node.removeAttribute(key); node.removeAttribute(key + '-shown'); }
    }
  }
  function fixTree(root) {
    fixNode(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); let n;
    while ((n = w.nextNode())) fixNode(n);
  }
  const observer = new MutationObserver(list => {
    if (applying) return; applying = true;
    try { for (const m of list) { if (m.type === 'childList') m.addedNodes.forEach(fixTree); else fixNode(m.target); } }
    finally { applying = false; observer.takeRecords(); }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // switching language: redo everything that is on screen
  let shownLang = null;
  setInterval(() => { const now = lang(); if (now !== shownLang) { shownLang = now; applying = true; try { fixTree(document.body); } finally { applying = false; observer.takeRecords(); } } }, 250);

  // ---- Windows notifications and dates ----
  if (window.Notification) {
    const N = window.Notification;
    window.Notification = class extends N { constructor(title, options = {}) { super(tr(title), { icon: './assets/icon-256.png', ...options, body: options.body && tr(options.body) }); } }; // with the Rehatt icon
  }
  for (const fn of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
    const base = Date.prototype[fn];
    Date.prototype[fn] = function (locale, options) { return base.call(this, lang() === 'ms' && /^en/i.test(String(locale || '')) ? 'ms-MY' : locale, options); };
  }
})();
