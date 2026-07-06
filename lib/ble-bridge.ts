/**
 * BLE Bridge — replaces tools/phone_sim.py on the phone.
 *
 * Flow: ESP32 → ADPCM audio frames over BLE → decode PCM → build WAV →
 *       POST base64 WAV to Supabase `transcribe` function (Groq Whisper) →
 *       call ai-chat → write answer back to device.
 *
 * STT is cloud-based (Groq Whisper via `transcribe` edge function) so this
 * works in Expo Go and dev builds. BLE still requires a dev build.
 * Requires GROQ_API_KEY set as a Supabase secret.
 */

import { BleManager, type Device, type Subscription } from 'react-native-ble-plx';
import { supabase } from '@/lib/supabase';
import { adpcmDecode, makeAdpcmState, type AdpcmState } from '@/lib/adpcm';

// ── BLE constants (must match main/ble_svc.h) ────────────────────────────────
const DEVICE_NAME = 'CompanionHUD';
const SERVICE_UUID = '0112b649-c9b8-4c88-9c4a-e50e24dcca9e';
const AUDIO_CHAR_UUID = '0212b649-c9b8-4c88-9c4a-e50e24dcca9e';
const CMD_CHAR_UUID = '0312b649-c9b8-4c88-9c4a-e50e24dcca9e';
// RESPONSE_CHAR_UUID added in Part 2 (PreviewCard): '0412b649-...'

const BLE_CMD_SET_TIME = 0x03;
const BLE_CMD_SET_QUESTION = 0x04;
const BLE_CMD_SET_ANSWER = 0x05;

const SAMPLE_RATE_HZ = 16000; // must match MIC_SAMPLE_RATE_HZ in main/mic.c
const MAX_TEXT_BYTES = 200;   // matches gatt_svr.c write buffer
const TIME_RESYNC_MS = 5 * 60 * 1000;

// ── State ─────────────────────────────────────────────────────────────────────
export type BridgeStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'processing'
  | 'error';

export interface BridgeState {
  status: BridgeStatus;
  lastQuestion: string;
  lastAnswer: string;
  error: string | null;
}

type Listener = (state: BridgeState) => void;

// ── Singleton manager ─────────────────────────────────────────────────────────
class BleBridgeManager {
  private manager: BleManager | null = null;
  private device: Device | null = null;
  private audioSub: Subscription | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private adpcmState: AdpcmState = makeAdpcmState();
  private samples: number[] = [];
  private history: Array<{ role: string; content: string }> = [];
  private listeners = new Set<Listener>();
  private _companionType = 'habitCoach';
  private _state: BridgeState = {
    status: 'idle',
    lastQuestion: '',
    lastAnswer: '',
    error: null,
  };
  private _stopping = false;

  get companionType() { return this._companionType; }
  setCompanionType(type: string) { this._companionType = type; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this._state); // immediate initial snapshot
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<BridgeState>) {
    this._state = { ...this._state, ...patch };
    this.listeners.forEach(fn => fn(this._state));
  }

  private getBleManager(): BleManager {
    if (!this.manager) {
      try {
        this.manager = new BleManager();
      } catch {
        throw new Error('BLE native module not available. A dev build (not Expo Go) is required.');
      }
    }
    return this.manager;
  }

  async start() {
    if (this._state.status !== 'idle' && this._state.status !== 'error') return;
    this._stopping = false;
    await this._scanAndConnect();
  }

  stop() {
    this._stopping = true;
    this.audioSub?.remove();
    this.audioSub = null;
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    this.device?.cancelConnection().catch(() => {});
    this.device = null;
    this.samples = [];
    this.adpcmState = makeAdpcmState();
    this.emit({ status: 'idle', error: null });
  }

  private async _scanAndConnect() {
    this.emit({ status: 'scanning', error: null });
    let ble: BleManager;
    try {
      ble = this.getBleManager();
    } catch (e: any) {
      this.emit({ status: 'error', error: e?.message ?? 'BLE unavailable' });
      return;
    }

    let found = false;
    ble.startDeviceScan(null, { allowDuplicates: false }, async (err, device) => {
      if (err || found || this._stopping) return;
      if (device?.name !== DEVICE_NAME) return;
      found = true;
      ble.stopDeviceScan();
      await this._connect(device);
    });

    // Timeout scan after 20s
    setTimeout(() => {
      if (!found && !this._stopping) {
        ble.stopDeviceScan();
        this.emit({ status: 'error', error: 'Device not found. Is CompanionHUD powered on?' });
      }
    }, 20_000);
  }

  private async _connect(device: Device) {
    try {
      this.emit({ status: 'connecting' });
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      this.device = connected;

      connected.onDisconnected(() => {
        if (this._stopping) return;
        this.audioSub?.remove();
        this.audioSub = null;
        if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        this.device = null;
        this.samples = [];
        this.adpcmState = makeAdpcmState();
        // Auto-reconnect after 3s
        setTimeout(() => { if (!this._stopping) this._scanAndConnect(); }, 3000);
      });

      this.audioSub = connected.monitorCharacteristicForService(
        SERVICE_UUID, AUDIO_CHAR_UUID, (err, char) => {
          if (err || !char?.value) return;
          this._onAudioFrame(char.value);
        }
      );

      await this._syncTime(connected);
      this.timerId = setInterval(() => {
        if (this.device) this._syncTime(this.device).catch(() => {});
      }, TIME_RESYNC_MS);

      this.emit({ status: 'connected' });
    } catch (e: any) {
      this.emit({ status: 'error', error: e?.message ?? 'Connection failed' });
    }
  }

  private _onAudioFrame(base64: string) {
    const raw = base64ToBytes(base64);
    const payload = raw.slice(1); // strip sequence byte

    if (payload.length === 0) {
      // end-of-session marker
      this._finishSession().catch(() => {});
      return;
    }

    if (this._state.status === 'connected') {
      this.emit({ status: 'listening' });
    }
    this.samples.push(...adpcmDecode(payload, this.adpcmState));
  }

  private async _finishSession() {
    const captured = this.samples.slice();
    this.samples = [];
    this.adpcmState = makeAdpcmState();

    if (captured.length < 1600) return; // < 0.1s — likely silence, skip

    this.emit({ status: 'processing' });

    try {
      const base64Wav = pcmToWavBase64(captured, SAMPLE_RATE_HZ);
      const question = await transcribeViaSupabase(base64Wav);
      if (!question) {
        this.emit({ status: 'connected' });
        return;
      }

      this.emit({ lastQuestion: question });
      if (this.device) await writeCmd(this.device, BLE_CMD_SET_QUESTION, question);

      const answer = await this._callAiChat(question);
      this.emit({ lastAnswer: answer });
      if (this.device) await writeCmd(this.device, BLE_CMD_SET_ANSWER, answer);

      this.history.push({ role: 'user', content: question });
      this.history.push({ role: 'assistant', content: answer });
      if (this.history.length > 20) this.history = this.history.slice(-20);
    } catch (e: any) {
      console.warn('[ble-bridge] session error:', e?.message);
    } finally {
      if (!this._stopping) this.emit({ status: 'connected' });
    }
  }

  private async _callAiChat(question: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        message: question,
        companionType: this._companionType,
        conversationHistory: this.history.slice(-10),
        execute: true, // high-confidence actions execute server-side
        // The phone (not the ESP32) sends this — same fix as ChatScreen.tsx,
        // see supabase/functions/_shared/localDate.ts (audit 2026-07-06).
        // Matters more here than in-app: execute:true means the server
        // actually writes the task's date, not just displays it.
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      },
    });
    if (error) throw error;
    return (data?.response ?? '').trim();
  }

  private async _syncTime(device: Device) {
    const now = new Date();
    const payload = new Uint8Array([
      BLE_CMD_SET_TIME,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    ]);
    await device.writeCharacteristicWithResponseForService(
      SERVICE_UUID, CMD_CHAR_UUID, bytesToBase64(payload)
    );
  }
}

export const bleBridge = new BleBridgeManager();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeCmd(device: Device, opcode: number, text: string) {
  const textBytes = truncateUtf8(text, MAX_TEXT_BYTES);
  const payload = new Uint8Array(1 + textBytes.length);
  payload[0] = opcode;
  payload.set(textBytes, 1);
  await device.writeCharacteristicWithResponseForService(
    SERVICE_UUID, CMD_CHAR_UUID, bytesToBase64(payload)
  );
}

function truncateUtf8(text: string, maxBytes: number): Uint8Array {
  const encoder = new TextEncoder();
  const full = encoder.encode(text);
  if (full.length <= maxBytes) return full;
  // Trim to maxBytes, then drop any trailing incomplete multibyte sequence
  let end = maxBytes;
  while (end > 0 && (full[end] & 0xc0) === 0x80) end--;
  return full.slice(0, end);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function pcmToWavBase64(samples: number[], sampleRate: number): string {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const total = 44 + dataSize;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);

  // RIFF header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);   // PCM
  view.setUint16(22, 1, true);   // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byteRate
  view.setUint16(32, 2, true);   // blockAlign
  view.setUint16(34, 16, true);  // bitsPerSample
  // data chunk
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }

  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

async function transcribeViaSupabase(base64Wav: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('transcribe', {
    body: { audio: base64Wav, lang: 'en' },
  });
  if (error) {
    console.warn('[ble-bridge] transcribe error:', error);
    return '';
  }
  return (data?.transcript ?? '').trim();
}
