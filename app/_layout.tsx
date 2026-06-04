import 'react-native-gesture-handler';
// useEffect runs code after the screen renders. useState stores values that can change.
import { useEffect, useState } from 'react';
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

// Lets us lock the app to portrait by default (the focus timer unlocks it for landscape).
import * as ScreenOrientation from 'expo-screen-orientation';

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

  // router lets us programmatically send the user to a different screen.
  const router = useRouter();

  // segments is an array of the current URL path, e.g. ['(auth)', 'login'] or ['(tabs)'].
  // We use this to know which section of the app the user is currently in.
  const segments = useSegments();

  // Load our custom fonts. fontsLoaded becomes true once they're downloaded and ready.
  // Until then, we don't render anything (to avoid text flashing with the wrong font).
  const [fontsLoaded] = useFonts({
    PixeloidSans_400Regular: require('@/assets/fonts/PixeloidSans.ttf'),
    PixeloidSans_700Bold: require('@/assets/fonts/PixeloidSans-Bold.ttf'),
  });

  // Once fonts are ready, hide the splash screen and show the app.
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Lock the whole app to portrait by default. The focus timer screen unlocks this
  // for landscape while it's open, then re-locks portrait when you leave it.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  // On first load, check if the user already has a saved login session on their device.
  // Also subscribe to future login/logout events so we react to them in real time.
  useEffect(() => {
    // getSession checks AsyncStorage for a saved login token.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false); // We now know the login state, so stop showing the loading screen.
    });

    // onAuthStateChange fires whenever the user logs in or logs out.
    // This keeps our session state in sync automatically.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // When this component unmounts (app closes), stop listening to auth changes.
    return () => subscription.unsubscribe();
  }, []);

  // This runs whenever login state, current screen, or font loading changes.
  // It's the "traffic cop" — it decides which screen the user should be on.
  useEffect(() => {
    // Don't redirect until we know the login state and fonts are ready.
    if (loading || !fontsLoaded) return;

    // Check if the user is currently on an auth screen (login/signup).
    const inAuth = segments[0] === '(auth)';

    if (!session && !inAuth) {
      // Not logged in and not on the login screen — send them to login.
      router.replace('/(auth)/login');
    } else if (session && inAuth) {
      // Logged in but still on the login screen — send them to the main app.
      router.replace('/(tabs)');
    }
  }, [session, segments, loading, fontsLoaded]);

  // Don't render anything until fonts are loaded, to avoid a flash of unstyled text.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Dark icons/text in the status bar (time, battery) to contrast with our light background. */}
      <StatusBar style="dark" />

      {/* Stack is the navigation system. It manages moving between screens.
          headerShown: false hides the default navigation header bar on every screen. */}
      <Stack screenOptions={{ headerShown: false }}>
        {/* Register the two main sections of the app as navigable destinations. */}
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="calendar" options={{ presentation: 'modal' }} />
        <Stack.Screen name="workouts" />
        <Stack.Screen name="workout-detail" />
        <Stack.Screen name="steps" />
        <Stack.Screen name="focus-timer" />
      </Stack>
    </GestureHandlerRootView>
  );
}
