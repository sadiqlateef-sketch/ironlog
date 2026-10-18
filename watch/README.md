# Ironlog for Wear OS

The watch app: link with a code, log sets, rest timer, heart rate, offline sync.
Wear OS 3 or newer (Pixel Watch, Galaxy Watch 4 and later, and others).

## Get the APK

**Easiest:** on GitHub, open Actions > **Watch APK** > Run workflow. When it
finishes, download `ironlog-watch-apk` from the run's Artifacts and unzip it
to get `app-release.apk`. It needs the `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` repository secrets, the same ones the
phone build uses.

**On your computer** (needs Android Studio for the Android SDK):

```bash
cd watch
cp config.example.json config.json   # then put in your Supabase URL and publishable key
npm install
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

## Install it on the watch

Watches don't have a file manager, so you install over Wi-Fi with `adb`
(it comes with Android Studio, or as "platform-tools" on its own):

1. On the watch, open Settings > System > About > Versions and tap
   **Build number** 7 times (Galaxy watches: About watch > Software information >
   Software version). This turns on Developer options.
2. In Settings > Developer options, turn on **ADB debugging** and
   **Wireless debugging**. Tap "Pair new device" to see an IP address,
   port and pairing code.
3. On your computer:

   ```bash
   adb pair <ip>:<pairing-port>      # type the pairing code
   adb connect <ip>:<port>           # the port shown on the Wireless debugging screen
   adb install app-release.apk
   ```

4. Open **Ironlog** on the watch, then on your phone go to Home > Link watch
   and type the code.

The first time you start a workout, the watch asks to read your heart rate.
Allow it.

## Use it without your phone

Home shows your program's **Up next** day (or your routines). Tap it to start.
The watch keeps a copy of your plan and of the workout in progress, so this
works with no signal too: everything you log waits on the watch and syncs
once it's back online. Open the app somewhere with signal now and then so the
saved plan stays current.

In a workout, **🎤 Say a set** opens the watch's speech screen. Say "185 for
8" (or "rows 70 for 10" to log on another exercise) and it's logged, with
**Undo** right below.

## Develop

```bash
npm start          # Metro bundler
npm run android    # install a debug build on a connected watch or emulator
npm test           # unit tests for the sync queue and set logic
npm run typecheck
npm run lint
```

| File | What it does |
| ---- | ------------ |
| `App.tsx` | Picks the screen: link, home, workout |
| `src/screens/` | Pair, Home, Workout (log a set, rest, summary) |
| `src/queue.ts` | Offline queue: saves each change on the watch, sends it when online |
| `src/voice.ts` + `android/.../VoiceModule.kt` | "Say a set": the watch's speech screen, on-device where it can |
| `src/voiceSet.ts` | Reads "185 for 8" (a copy of the phone's `src/lib/voice-set.ts`; a test keeps them the same) |
| `src/logic.ts` | Weight steps, pre-fill, rest rules, heart-rate zones (pure, tested) |
| `src/api.ts` | Database reads and writes (Supabase) |
| `src/pairing.ts` | Watch side of linking (server: `supabase/functions/watch-pair`) |
| `src/heartRate.ts` + `android/.../HeartRateModule.kt` | Heart-rate sensor via Wear OS Health Services |
