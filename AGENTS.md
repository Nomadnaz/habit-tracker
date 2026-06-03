# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## Cursor Cloud specific instructions

### Product

**Habit Tree** is an Expo SDK 54 (React Native) habit tracker with Supabase auth and local-first task storage (AsyncStorage + background Supabase sync). See `CLAUDE.md` for architecture and commands.

### Dependencies

- Install with `npm install` from the repo root.
- **Web in Cloud VMs:** `package.json` does not list `react-native-web` / `react-dom` by default. Before `npx expo start --web`, run once per environment:

  ```bash
  npx expo install react-native-web react-dom @expo/metro-runtime
  ```

  (Expo pins SDK 54–compatible versions.)

### Running the dev server

| Target | Command | Notes |
|--------|---------|--------|
| Metro (QR / Expo Go) | `npx expo start` | Default; scan QR on a device with Expo Go |
| Web (Cloud / browser) | `npx expo start --web` | Use after web deps above; default port **8081** |
| Android / iOS sim | `npx expo start --android` / `--ios` | Requires emulator/simulator |

Run long-lived servers in **tmux** (e.g. session `expo-web-dev`). `CI=1` disables watch/reload noise in headless VMs but is optional.

### Lint / tests / build

No ESLint, test runner, or production build is configured. Use `npx tsc --noEmit` for a TypeScript check.

### External services

- **Supabase** (hosted): URL and anon key are in `lib/supabase.ts`. Auth and cloud task sync require network access to that project.
- **Sign-up** sends a confirmation email; **sign-in fails** until the email is confirmed (`email_not_confirmed`). For full E2E (TODAY tab, add/toggle tasks), use a **pre-confirmed test account** (see Cloud Agent secrets) or confirm sign-up via email.
- No local Supabase/Docker stack in this repo.

### Auth / hello-world in the browser

1. Start web dev server → open `http://localhost:8081`.
2. Sign in with a confirmed Supabase user → root layout redirects to `/(tabs)`.
3. On **TODAY**, add a task in the input and submit — core local-first flow (AsyncStorage; Supabase sync is fire-and-forget).

`Alert` from React Native may not surface auth errors clearly on web; check the browser console or Supabase API responses if login appears to do nothing.
