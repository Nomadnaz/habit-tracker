import { File, Paths } from "expo-file-system";
import { useShareIntent } from "expo-share-intent";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

const RELAY_URL = process.env.EXPO_PUBLIC_RELAY_URL;
const RELAY_KEY = process.env.EXPO_PUBLIC_RELAY_KEY;

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; uri: string }
  | { kind: "error"; message: string };

async function convert(link: string): Promise<string> {
  const res = await fetch(`${RELAY_URL}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RELAY_KEY}` },
    body: JSON.stringify({ url: link }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Server error ${res.status}`);
  }
  const file = new File(Paths.cache, `video-${Date.now()}.mp4`);
  file.write(new Uint8Array(await res.arrayBuffer()));
  return file.uri;
}

function share(uri: string) {
  return Sharing.shareAsync(uri, { mimeType: "video/mp4", UTI: "public.mpeg-4" });
}

export default function App() {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent();
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!hasShareIntent) return;
    const link = shareIntent.webUrl ?? shareIntent.text;
    resetShareIntent();
    if (!link) {
      setState({ kind: "error", message: "That share didn't include a link." });
      return;
    }
    setState({ kind: "working" });
    convert(link)
      .then((uri) => {
        setState({ kind: "done", uri });
        return share(uri);
      })
      .catch((e: Error) => setState({ kind: "error", message: e.message }));
  }, [hasShareIntent]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {state.kind === "idle" && (
        <>
          <Text style={styles.title}>Video Relay</Text>
          <Text style={styles.body}>
            In TikTok or Instagram, tap Share, then choose Video Relay. The video comes back as
            a normal file you can send anywhere.
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
        </>
      )}
      {state.kind === "working" && (
        <>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.body}>Converting…</Text>
        </>
      )}
      {state.kind === "done" && (
        <>
          <Text style={styles.title}>Ready</Text>
          <Pressable style={styles.button} onPress={() => share(state.uri)}>
            <Text style={styles.buttonText}>Share video</Text>
          </Pressable>
        </>
      )}
      {state.kind === "error" && (
        <>
          <Text style={styles.title}>Couldn't convert</Text>
          <Text style={styles.error}>{state.message}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  body: { color: "#aaa", fontSize: 16, textAlign: "center", lineHeight: 22 },
  error: { color: "#ff5a5a", fontSize: 14, textAlign: "center" },
  button: { backgroundColor: "#fff", paddingVertical: 14, paddingHorizontal: 28, borderRadius: 999 },
  buttonText: { color: "#000", fontSize: 16, fontWeight: "600" },
});
