# Video Relay

Share a TikTok or Instagram link to **Video Relay**. It comes back as a plain MP4 with
your logo in the bottom-right, and the share sheet opens so you can send it anywhere.
Nobody you send it to needs an account.

Separate from the habit tracker. Two parts:

- `server/`: downloads the video (yt-dlp) and burns in `watermark.png` (ffmpeg, bundled
  via the `imageio-ffmpeg` pip package). It also serves a web page at `/`: paste a link,
  then watch, download or share the result.
- `app/`: Expo SDK 54 app. It registers as a share target on Android (share intent) and
  iOS (Share Extension, shown as "Relay Video").

## Try it on your PC

Needs Python 3.10+, nothing else. From the repo:

```bash
cd video-relay/server
python -m venv .venv
.venv\Scripts\activate          # Windows; on macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8080
```

Open http://localhost:8080 and paste a link.

To use it from your phone, connect the phone to the same Wi-Fi and open
`http://<your PC's IP>:8080`. Allow Python through the firewall if Windows asks.
Without `RELAY_KEY` set there is no password, so anyone on your Wi-Fi can use it.
When it's online, set `RELAY_KEY` and open the page as `https://<host>/?key=<RELAY_KEY>`.

## 1. Your logo

Replace `server/watermark.png` with your logo. Use a PNG with a transparent background.
It's scaled to 15% of the video's width and inset 3% from the bottom-right corner.
The file there now is a placeholder that says "RELAY".

## 2. Deploy the server

Any Docker host works. Fly.io example, run from `server/`:

```bash
fly launch --no-deploy            # accept the generated fly.toml
fly scale memory 1024             # ffmpeg needs headroom
fly secrets set RELAY_KEY=$(openssl rand -hex 16)   # note this value
fly deploy
```

Check it: open `https://<app>.fly.dev/?key=<RELAY_KEY>` and convert a link.

**Instagram:** anonymous downloads work, but Instagram rate-limits them quickly
("redirected to the login page"). To fix that, export cookies from a logged-in browser
(Netscape `cookies.txt` format, e.g. with the "Get cookies.txt LOCALLY" extension). Save the
file as `server/cookies.txt`, then redeploy. It's gitignored. Use a throwaway Instagram account.

**Keep yt-dlp fresh:** TikTok and Instagram change often. When links stop working, bump
`yt-dlp` in `requirements.txt` and redeploy.

## 3. Build the app

The share sheet needs native code, so Expo Go won't work. Build with EAS:

```bash
cd app
cp .env.example .env              # fill in your server URL and the RELAY_KEY
npm install
npx eas-cli build --profile development --platform ios      # or android / all
npx expo start --dev-client
```

For a standalone build that doesn't need the dev server, use `--profile preview`. EAS only
reads `.env` for local builds. For cloud builds, also add both `EXPO_PUBLIC_*` values as EAS
environment variables (`eas env:create`).

iOS: the share extension uses App Group `group.com.nomadnaz.videorelay`. EAS creates it
when it sets up credentials. If you change the bundle identifier in `app.json`, the group
changes with it.

## API

`POST /convert` with header `Authorization: Bearer <RELAY_KEY>` and body `{"url": "..."}`.
It returns `video/mp4`. A link without a video returns 422 with `{"detail": "..."}`.
