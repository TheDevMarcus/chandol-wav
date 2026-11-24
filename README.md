# chandol.wav

A fan-made player and tracker for chandol / BoyWithUke: a web app, a small realtime
radio + accounts backend, and an Electron desktop app (`.wav`).

Live site: https://chandolwav.pages.dev
Desktop installers: see [Releases](../../releases). The app updates itself from there.

## Read this first: what is not in this repo

This is a **redacted public copy**. The real project keeps its backend endpoints,
storage bucket and API keys in a private repository, and we can't publish them.
Everywhere one of those belongs, the code has a `YOUR-...` placeholder instead.

Without them filled in, the interface loads, but there is no music catalogue, no audio,
no accounts, no radio and no juice mode.

| Placeholder | Where it appears | What it is |
|---|---|---|
| `YOUR-R2-PUBLIC-BUCKET.r2.dev` | `js/core/data.js`, `radio/src/index.js`, `tools/*.mjs` | Public storage bucket holding the audio and the catalogue JSON files listed in `js/core/data.js`. Not included. |
| `YOUR-RADIO-WORKER.YOUR-SUBDOMAIN.workers.dev` | `js/ui/account.js`, `js/ui/profile.js`, `js/radio/radio.js`, `tools/radio-admin.sh` | The deployed radio/accounts Cloudflare Worker. The Worker's source is in `radio/`, so you can deploy your own. |
| `YOUR-JUICE-BACKEND.example.com` | `js/core/juice.js` | Backend that powers juice mode. Not included. |
| `YOUR_GOOGLE_SHEET_ID` | `tools/build-tracker.py`, `data/tracker-index.json` | Spreadsheet the tracker data is exported from. The exported JSON is already in `data/`. |

API keys are never stored in the code. The Worker reads two secrets from its environment:

| Secret | Used for |
|---|---|
| `IMGBB_KEY` | Uploading profile pictures and banners to imgbb |
| `ADMIN_KEY` | Authorising the `/admin` endpoint (`tools/radio-admin.sh`) |

## Filling it in yourself

Find every spot that needs your own value:

```sh
grep -rn "YOUR-\|YOUR_" --exclude-dir=.git .
```

Deploy your own radio/accounts Worker:

```sh
cd radio
npx wrangler secret put IMGBB_KEY
npx wrangler secret put ADMIN_KEY
npx wrangler deploy
```

For local development copy `radio/.dev.vars.example` to `radio/.dev.vars` and fill it in
(this file is gitignored).

You will also need to host your own audio and catalogue files and point the bucket
placeholder at them.

## Running it

Web app, locally:

```sh
python3 tools/serve.py        # http://127.0.0.1:8080
```

Desktop app:

```sh
cd desktop-electron
npm install
npm start                     # run it
npm run dist                  # build installers into release/
```

## Notes

- `data/` is a snapshot of the tracker exports.
- `desktop/` is an older Tauri version of the desktop app and is no longer used.
- Official installers are built from the private repository and published to this
  repo's Releases. The release workflow is therefore not included here.
