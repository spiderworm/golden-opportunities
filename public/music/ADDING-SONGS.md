# Adding songs

The game plays the songs listed in `songs.json`, in this folder, through the studio's music player. With no songs listed, the music player doesn't appear at all.

To add a song made in Suno:

1. Download it as M4A and put it in this folder. Name the file in lowercase words joined by hyphens, for example `nebula-waltz.m4a`. Suno's M4A holds Opus audio; we checked that it plays in Chromium and WebKit, the engines behind Chrome and Safari.
2. Add it to `songs.json`:

   ```json
   {
     "songs": [
       { "id": "nebula-waltz", "file": "nebula-waltz.m4a", "title": "Nebula Waltz", "pinned": true },
       { "id": "ring-c-at-night", "file": "ring-c-at-night.m4a", "title": "Ring C at Night" }
     ]
   }
   ```

   - `id`: lowercase words and hyphens. Never change it once the song is out: players' hearts and on/off choices are kept by it, and analytics report it.
   - `file`: the file's name in this folder (`.mp3`, `.m4a`, `.ogg` or `.wav`).
   - `title`: the name players see.
   - `pinned` (optional): pinned songs play first, in list order, once each time the game opens. The rest are shuffled.
3. Reload the game. The music starts on the player's first click or key press.

An entry with a missing or malformed field, or an `id` already used, is left out. If a song doesn't appear, check its entry against the rules above.
