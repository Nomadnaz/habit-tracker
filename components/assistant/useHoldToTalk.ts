// Press-and-hold voice capture → transcribe → assistant turn.
// iOS records 16 kHz mono 16-bit linear PCM in a .wav container, because the
// `transcribe` Edge Function forwards the bytes to Groq as "audio.wav".
import { useRef } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  useAudioRecorder, requestRecordingPermissionsAsync, setAudioModeAsync,
  IOSOutputFormat, AudioQuality, type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { recStart, recCancel, recTranscribing, recFail, send, transcribe } from '@/lib/assistant';

const WAV: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: { outputFormat: 'default', audioEncoder: 'default' },
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
};

const MIN_HOLD_MS = 400; // shorter than this was a fumble, not speech

// Whisper's known output on silence / room noise. Seen in testing: a hold
// with nothing said came back as "you". Treat these as "didn't catch that"
// rather than sending them to the AI as if they were a request.
const PHANTOM = /^(you|thank you|thanks for watching|bye|okay|\.+|\s*)[.!]?$/i;

async function readBase64(uri: string): Promise<string> {
  if (Platform.OS !== 'web') return new File(uri).base64();
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function useHoldToTalk() {
  const recorder = useAudioRecorder(WAV);
  const phase = useRef<'idle' | 'starting' | 'recording'>('idle');
  const stopWanted = useRef(false);
  const startedAt = useRef(0);

  async function finish() {
    phase.current = 'idle';
    try { await recorder.stop(); } catch { /* never started */ }
    setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    if (Date.now() - startedAt.current < MIN_HOLD_MS) { recCancel(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recTranscribing();
    try {
      const uri = recorder.uri;
      if (!uri) throw new Error('no recording');
      const text = await transcribe(await readBase64(uri));
      if (!text || PHANTOM.test(text)) { recFail("Didn't catch that — hold and try again."); return; }
      await send(text, { voice: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      recFail("Couldn't hear that — try again.");
    }
  }

  async function start() {
    if (phase.current !== 'idle') return;
    phase.current = 'starting';
    stopWanted.current = false;
    recStart();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        phase.current = 'idle';
        recFail('Microphone is off — turn it on in Settings.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      phase.current = 'recording';
      if (stopWanted.current) await finish(); // released during the permission prompt
    } catch {
      phase.current = 'idle';
      recFail("Couldn't start the mic.");
    }
  }

  function stop() {
    if (phase.current === 'starting') { stopWanted.current = true; return; }
    if (phase.current === 'recording') void finish();
  }

  return { start, stop };
}
