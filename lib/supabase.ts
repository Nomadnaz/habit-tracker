// This polyfill makes URL handling work correctly in React Native.
// Without it, Supabase's auth links (like email confirmation URLs) would break on mobile.
import 'react-native-url-polyfill/auto';

// createClient is the function that connects us to our Supabase project (our backend/database).
import { createClient } from '@supabase/supabase-js';

// AsyncStorage is the phone's built-in key-value storage.
// We use it here so Supabase can save the user's login session to the device,
// meaning they stay logged in even after closing and reopening the app.
import AsyncStorage from '@react-native-async-storage/async-storage';

// These two values identify YOUR specific Supabase project.
// The URL is like the address of your database server.
// The anon key is a public key that tells Supabase which project is making the request.
// It's safe to leave this in the code — it only allows what your Row Level Security rules permit.
const SUPABASE_URL = 'https://dnbdjjrjudrzugxkpeeh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuYmRqanJqdWRyenVneGtwZWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzQ2NjAsImV4cCI6MjA5NTYxMDY2MH0.w-s4KT7vKH_yUkpAV8wc47o4EjrdFhPfDiCxqDcvj1Q';

// Create the Supabase client and export it so every other file in the app can import
// and use it to talk to the database or handle authentication.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Tell Supabase to save the session (login token) using AsyncStorage on the device,
    // so the user doesn't have to log in every time they open the app.
    storage: AsyncStorage,

    // Automatically get a fresh login token before it expires,
    // so the user is never unexpectedly logged out mid-session.
    autoRefreshToken: true,

    // Keep the session saved between app closes/opens.
    persistSession: true,

    // In a normal website, Supabase detects login via the URL (e.g. after email confirmation).
    // On mobile there's no browser URL bar, so we turn this off to avoid errors.
    detectSessionInUrl: false,
  },
});
