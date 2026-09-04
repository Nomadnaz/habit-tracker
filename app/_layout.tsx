import 'react-native-gesture-handler';
// useEffect runs code after the screen renders. useState stores values that can change.
import { useEffect, useState, useRef } from 'react';
import { Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Stack is the navigation container. useRouter lets us redirect the user to a different screen.
// useSegments tells us which part of the app the user is currently on (e.g. auth or tabs).
import { Stack, useRouter, useSegments } from 'expo-router';

// Controls the status bar at the top of the phone (time, battery, etc.).
import { StatusBar } from 'expo-status-bar';

// The TypeScript type for a Supabase login session — used to tell TypeScript what shape the data is.
import { Session } from '@supabase/supabase-js';

// Our custom fonts. Pixeloid Sans is a pixel font used throughout the app.
import { useFonts } from 'expo-font';

// SplashScreen is the loading screen shown while the app starts up.
// We control it manually so we can keep it visible until fonts are ready.
import * as SplashScreen from 'expo-splash-screen';

// Our Supabase client — the connection to our backend/database.
import { supabase } from '@/lib/supabase';

// Registers the background-location TaskManager task at module scope (must
// happen on cold start, not inside a component) — see that file's header
// for the unverified-on-device caveat (task 010/032).
import '@/lib/locationTask';

// Live sync of tasks created OUTSIDE the app (e.g. by the voice device via
// ai-chat) into the on-device store + Apple Calendar — see lib/use-remote-task-sync.ts.
import { useRemoteTaskSync } from '@/lib/use-remote-task-sync';

// Auto-reconnect the Companion HUD BLE bridge on launch/foreground.
import { useBleAutoConnect } from '@/lib/ble-bridge';

// Auto-refresh today's Apple Health steps/activity on launch/foreground —
// see lib/apple-health.ts's useAppleHealthAutoSync for why this exists
// (daily_steps was going stale between manual syncs).
import { useAppleHealthAutoSync } from '@/lib/apple-health';

// Slide-down banner + buzz when a task arrives live from the device.
import { RemoteTaskBanner } from '@/components/RemoteTaskBanner';

// One-time migration of date keys from the old "YYYY-M-D" format to the
// canonical zero-padded "YYYY-MM-DD" format. Self-guarding — safe to call
// every launch. See tasks/004.
import { migrateDateKeysV2 } from '@/lib/migrateDateKeysV2';

// Lets us lock the app to portrait by default (the focus timer unlocks it for landscape).
import * as ScreenOrientation from 'expo-screen-orientation';

// Onboarding (task 062): local "have I onboarded on this device" flag +
// the flush that writes locally-collected answers into Supabase once a
// session exists (handles both immediate-session signup and the
// email-confirmation-required path, where the session only appears on a
// later login).
import { isOnboardingComplete, flushOnboardingIfNeeded } from '@/lib/onboarding-data';

// Keep the splash screen visible immediately on launch.
// Without this, it would disappear too early before fonts are loaded.
SplashScreen.preventAutoHideAsync();

// RootLayout is the outermost wrapper of the entire app.
// Everything — auth screens and tab screens — lives inside this.
// It's responsible for: loading fonts, watching login state, and redirecting the user.
export default function RootLayout() {
  // session holds the current user's login info. null means no one is logged in.
  const [session, setSession] = useState<Session | null>(null);

  // loading is true while we're still checking if the user is already logged in.
  // We wait for this before redirecting, so we don't flash the wrong screen.
  const [loading, setLoading] = useState(true);

  // True once the one-time date-key migration has finished. Screens must not
  // read @tasks/@body/etc. before this, or they'll see pre-migration keys.
  const [dateKeysMigrated, setDateKeysMigrated] = useState(false);

  // null = not checked yet (don't route on a guess); true/false once known.
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // router lets us programmatically send the user to a different screen.
  const router = useRouter();

  // segments is an array of the current URL path, e.g. ['(auth)', 'login'] or ['(tabs)'].
  // We use this to know which section of the app the user is currently in.
  const segments = useSegments();

  // A live-updating ref mirror of segments, for the auth-effect below (which
  // only runs once on mount, so a plain closure over `segments` there would
  // always see the mount-time value, not the current screen).
  const segmentsRef = useRef(segments);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  // Keep on-device tasks in sync with task changes that originate outside the
  // app (the voice device, other devices) in real time. No-op until logged in.
  useRemoteTaskSync(session?.user?.id ?? null);

  // Auto-(re)connect the Companion HUD BLE bridge on launch and whenever the
  // app returns to the foreground — previously this only ever started from
  // the Companion HUD screen's Connect button, so a set done at the gym with
  // the app not open on that exact screen had no live connection to relay
  // over. No-op for anyone who has never paired a device.
  useBleAutoConnect();

  // Same idea for steps: re-pull from HealthKit on launch/foreground so the
  // Companion HUD's KCAL/STEPS stats don't read from a month-old sync.
  // No-op for anyone who has never connected Apple Health.
  useAppleHealthAutoSync();

  // Load our custom fonts. fontsLoaded becomes true once they're downloaded and ready.
  // Until then, we don't render anything (to avoid text flashing with the wrong font).
  const [fontsLoaded] = useFonts({
    PixeloidSans_400Regular: require('@/assets/fonts/PixeloidSans.ttf'),
    PixeloidSans_700Bold: require('@/assets/fonts/PixeloidSans-Bold.ttf'),
  });

  // Once fonts are ready AND the date-key migration has finished AND we know
  // the onboarding flag, hide the splash screen and show the app — hiding it
  // earlier would let a screen flash with stale data or the wrong route.
  useEffect(() => {
    if (fontsLoaded && dateKeysMigrated && onboardingDone !== null) SplashScreen.hideAsync();
  }, [fontsLoaded, dateKeysMigrated, onboardingDone]);

  // Lock the whole app to portrait by default. The focus timer screen unlocks this
  // for landscape while it's open, then re-locks portrait when you leave it.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  // Run the one-time date-key migration before any screen reads @tasks/@body/etc.
  useEffect(() => {
    migrateDateKeysV2().finally(() => setDateKeysMigrated(true));
  }, []);

  // On first load, check if the user already has a saved login session on their device.
  // Also subscribe to future login/logout events so we react to them in real time.
  useEffect(() => {
    // getSession checks AsyncStorage for a saved login token.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false); // We now know the login state, so stop showing the loading screen.
      // Never auto-flush while still inside the onboarding flow itself: an
      // audit (2026-07-06) found that when signUp() makes a session appear
      // immediately (screen 9), this flush could fire before the user ever
      // reached briefing-builder (screen 10) — consuming and clearing the
      // pending answers before briefingModules was folded in, so that
      // choice silently never reached Supabase. briefing-builder.tsx calls
      // flushOnboardingIfNeeded() itself once it's actually done.
      if (session && segmentsRef.current[0] !== '(onboarding)') flushOnboardingIfNeeded();
    });

    // onAuthStateChange fires whenever the user logs in or logs out.
    // This keeps our session state in sync automatically.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Covers the "email confirmation required" onboarding path: the first
      // login after confirming is where the cached answers finally get a
      // userId to write against. Same (onboarding) guard as above.
      if (session && segmentsRef.current[0] !== '(onboarding)') flushOnboardingIfNeeded();
    });

    // When this component unmounts (app closes), stop listening to auth changes.
    return () => subscription.unsubscribe();
  }, []);

  // Whether this device has completed (or explicitly skipped) onboarding —
  // independent of login state, per task 062: new installs see the
  // onboarding flow before login, returning logged-out users still go
  // straight to the login screen as before. Re-read on every top-level
  // navigation (cheap AsyncStorage read), not just once on launch — the
  // welcome screen's "I already have an account" shortcut flips this flag
  // from inside (onboarding), and without a re-check here the routing
  // effect below would still see the stale `false` and bounce straight
  // back to onboarding after that screen's own router.replace('/(auth)/login').
  useEffect(() => {
    isOnboardingComplete().then(setOnboardingDone);
  }, [segments[0]]);

  // This runs whenever login state, current screen, or font loading changes.
  // It's the "traffic cop" — it decides which screen the user should be on.
  useEffect(() => {
    // Don't redirect until we know the login state, onboarding state, and fonts are ready.
    if (loading || !fontsLoaded || !dateKeysMigrated || onboardingDone === null) return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (session) {
      // Logged in but still on the login screen — send them to the main app.
      // Deliberately NOT auto-redirecting out of (onboarding) here: signUp()
      // on the account screen (screen 9) makes `session` truthy immediately,
      // but the user still has one more screen (briefing-builder, screen 10)
      // to see. That screen calls router.replace('/(tabs)') itself once it's
      // done — see app/(onboarding)/briefing-builder.tsx.
      if (inAuth) router.replace('/(tabs)');
    } else if (!inAuth) {
      // Logged out and NOT already sitting on the login screen. Checking
      // inAuth first (and doing nothing when true) fixes a real bug found in
      // audit (2026-07-06): the account screen (screen 9) replaces to
      // '/(auth)/login' when Supabase requires email confirmation (no
      // session yet), but this effect used to re-evaluate on that navigation
      // and — since onboardingDone was still false — immediately bounce the
      // user straight back to '/(onboarding)/welcome', a dead end with no
      // way to actually log in once they'd confirmed their email. Now,
      // reaching (auth) by any path (this redirect, or an explicit
      // router.replace from onboarding/welcome) always sticks.
      if (!onboardingDone && !inOnboarding) {
        // Brand-new device, never onboarded — the account wall is
        // deliberately late (task 062), so this comes before login.
        router.replace('/(onboarding)/welcome');
      } else if (onboardingDone) {
        // Already onboarded (or skipped) but logged out — the familiar path.
        router.replace('/(auth)/login');
      }
    }
  }, [session, segments, loading, fontsLoaded, dateKeysMigrated, onboardingDone]);

  // Don't render anything until fonts are loaded, to avoid a flash of unstyled text.
  if (!fontsLoaded) return null;

  // Hold the splash screen up a beat longer than fonts alone: rendering the
  // tabs before the date-key migration finishes would let a screen read
  // @tasks/@body in the old key format.
  if (!dateKeysMigrated) return null;

  // Same reasoning for the onboarding flag: without it we don't know yet
  // whether a logged-out user belongs on /(onboarding)/welcome or /(auth)/login.
  if (onboardingDone === null) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Dark icons/text in the status bar (time, battery) to contrast with our light background. */}
      <StatusBar style="dark" />

      {/* Stack is the navigation system. It manages moving between screens.
          headerShown: false hides the default navigation header bar on every screen. */}
      <Stack screenOptions={{ headerShown: false }}>
        {/* Register the main sections of the app as navigable destinations. */}
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="calendar" options={{ presentation: 'modal' }} />
        <Stack.Screen name="workouts" />
        <Stack.Screen name="workout-detail" />
        <Stack.Screen name="steps" />
        <Stack.Screen name="focus-timer" />
        <Stack.Screen name="calorie" />
        <Stack.Screen name="ble-bridge" />
        <Stack.Screen name="pair-device" />
        <Stack.Screen name="modals/sleep-detail" options={{ presentation: 'modal' }} />
        <Stack.Screen name="modals/goals" options={{ presentation: 'modal' }} />
        <Stack.Screen name="modals/finance" options={{ presentation: 'modal' }} />
        <Stack.Screen name="modals/mood" options={{ presentation: 'modal' }} />
        <Stack.Screen name="modals/cycle-tracking" options={{ presentation: 'modal' }} />
        <Stack.Screen name="modals/library" options={{ presentation: 'modal' }} />
        <Stack.Screen name="modals/search" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings/companion-persona" />
      </Stack>

      {/* Floats above every screen; shows when a task syncs in from the device. */}
      <RemoteTaskBanner />
    </GestureHandlerRootView>
  );
}
