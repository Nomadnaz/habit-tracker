// useState stores values that can change — like what the user typed, or whether we're loading.
import { useState } from 'react';
import {
  View,             // A box/container for grouping other elements.
  Text,             // Displays text on screen.
  TextInput,        // A field the user can type into.
  TouchableOpacity, // A button that responds to taps (with a press effect).
  StyleSheet,       // Used at the bottom to define all our styles in one place.
  KeyboardAvoidingView, // Automatically moves the layout up when the keyboard appears,
                        // so the keyboard doesn't cover the input fields.
  Platform,         // Tells us if we're on iOS or Android, so we can behave differently.
  ActivityIndicator, // A spinning loading indicator shown while waiting for a network request.
  Alert,            // Shows a native pop-up dialog with a message.
} from 'react-native';

// Our Supabase client — handles sign in and sign up requests.
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  // These four pieces of state track everything that can change on this screen.

  // What the user has typed in the email field.
  const [email, setEmail] = useState('');

  // What the user has typed in the password field.
  const [password, setPassword] = useState('');

  // Whether the form is in "sign up" mode (true) or "sign in" mode (false).
  // The user can toggle between these by tapping the link at the bottom.
  const [isSignUp, setIsSignUp] = useState(false);

  // True while we're waiting for Supabase to respond to a login/signup request.
  // Used to show the spinner and disable the button so the user can't tap twice.
  const [loading, setLoading] = useState(false);

  // This function runs when the user taps "SIGN IN" or "CREATE ACCOUNT".
  async function handleSubmit() {
    // If either field is empty, show an alert and stop — don't send the request.
    if (!email || !password) {
      Alert.alert('MISSING FIELDS', 'Please enter your email and password.');
      return;
    }

    setLoading(true); // Show the spinner while we wait for Supabase.

    if (isSignUp) {
      // CREATE ACCOUNT mode: register a new user with Supabase.
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        Alert.alert('SIGN UP FAILED', error.message);
      } else {
        // Supabase sends a confirmation email. The user must click it before they can log in.
        Alert.alert('CHECK YOUR EMAIL', 'We sent you a confirmation link.');
      }
    } else {
      // SIGN IN mode: log in with an existing account.
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        Alert.alert('LOGIN FAILED', error.message);
      }
      // If successful, the root layout (app/_layout.tsx) detects the new session
      // and automatically redirects the user to the main tabs — no redirect needed here.
    }

    setLoading(false); // Hide the spinner once we have a response.
  }

  return (
    // KeyboardAvoidingView shifts the whole screen upward when the keyboard appears.
    // On iOS we use 'padding' (adds space at the bottom).
    // On Android we use 'height' (shrinks the view height).
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>

        {/* App title: shows "[HABIT TREE]" with the brackets in orange. */}
        <View style={styles.headerRow}>
          <Text style={styles.bracket}>[</Text>
          <Text style={styles.title}>HABIT{'\n'}TREE</Text>
          <Text style={styles.bracket}>]</Text>
        </View>
        <Text style={styles.tagline}>TRACK. GROW. THRIVE.</Text>

        {/* The login/signup form card. */}
        <View style={styles.card}>
          {/* The label changes depending on which mode we're in. */}
          <Text style={styles.cardLabel}>{isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}</Text>

          {/* Email input. autoCapitalize="none" stops the phone from capitalising the first letter.
              keyboardType="email-address" shows the @ symbol on the keyboard. */}
          <TextInput
            style={styles.input}
            placeholder="EMAIL"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail} // Updates the email state every time the user types a character.
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {/* Password input. secureTextEntry hides the characters as the user types. */}
          <TextInput
            style={styles.input}
            placeholder="PASSWORD"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* The submit button. disabled={loading} prevents double-tapping while the request is in flight. */}
          <TouchableOpacity
            style={styles.button}
            onPress={handleSubmit}
            disabled={loading}
          >
            {/* Show a spinner while loading, otherwise show the button label. */}
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{isSignUp ? 'CREATE ACCOUNT  ›' : 'SIGN IN  ›'}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Toggle between sign in and sign up modes.
            !isSignUp flips the boolean — true becomes false and vice versa. */}
        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={styles.switchBtn}>
          <Text style={styles.switchText}>
            {isSignUp ? '← BACK TO SIGN IN' : 'NO ACCOUNT? SIGN UP →'}
          </Text>
        </TouchableOpacity>

      </View>
    </KeyboardAvoidingView>
  );
}

// All visual styles are defined here and referenced by name above.
// This keeps the layout code clean — styles live separately from structure.
const styles = StyleSheet.create({
  // The outermost container — fills the whole screen with a light grey background.
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  // Centres the content vertically on the screen and adds horizontal padding.
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  // Lays the "[" title "]" brackets side by side horizontally.
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  // The orange [ and ] brackets around the title.
  bracket: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 28,
    color: '#FF4D00',
    marginTop: 4,
  },
  // "HABIT TREE" in the pixel font, split across two lines with \n.
  title: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 28,
    color: '#000',
    lineHeight: 42,
    marginHorizontal: 12,
  },
  // The small orange tagline below the title.
  tagline: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 8,
    color: '#FF4D00',
    letterSpacing: 2,
    marginBottom: 40,
  },
  // The white rounded card that wraps the form fields.
  card: {
    backgroundColor: '#fff',
    borderRadius: 4,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  // "SIGN IN" / "CREATE ACCOUNT" label inside the card.
  cardLabel: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 9,
    color: '#FF4D00',
    marginBottom: 20,
    letterSpacing: 1,
  },
  // Styling for both text input fields (email and password).
  input: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 13,
    fontFamily: 'PixeloidSans_400Regular',
    color: '#000',
    marginBottom: 12,
  },
  // The orange submit button.
  button: {
    backgroundColor: '#FF4D00',
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  // White text inside the button.
  buttonText: {
    fontFamily: 'PixeloidSans_400Regular',
    color: '#fff',
    fontSize: 10,
    letterSpacing: 1,
  },
  // The "NO ACCOUNT? SIGN UP" toggle link at the bottom.
  switchBtn: {
    alignItems: 'center',
    marginTop: 24,
  },
  switchText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 8,
    color: '#FF4D00',
    letterSpacing: 1,
  },
});
