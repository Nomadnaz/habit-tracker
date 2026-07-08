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
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { adpcmDecode, makeAdpcmState, type AdpcmState } from '@/lib/adpcm';

// ── BLE constants (must match main/ble_svc.h) ────────────────────────────────
const DEVICE_NAME = 'CompanionHUD';
const SERVICE_UUID = '0112b649-c9b8-4c88-9c4a-e50e24dcca9e';
const AUDIO_CHAR_UUID = '0212b649-c9b8-4c88-9c4a-e50e24dcca9e';
const CMD_CHAR_UUID = '0312b649-c9b8-4c88-9c4a-e50e24dcca9e';
// RESPONSE_CHAR_UUID added in Part 2 (PreviewCard): '0412b649-...'
// Device → phone JSON actions, relayed to the device-state Edge Function:
const ACTION_CHAR_UUID = '0612b649-c9b8-4c88-9c4a-e50e24dcca9e';
// Pairing/provisioning TLV (encrypted-link-only on the device side; writing
// it triggers the OS bonding prompt):
const PROV_CHAR_UUID = '0712b649-c9b8-4c88-9c4a-e50e24dcca9e';

const PROV_TLV_SSID = 0x01;
const PROV_TLV_PSK = 0x02;
const PROV_TLV_REFRESH_TOKEN = 0x03;
const PROV_TLV_TZ_OFFSET = 0x04;

const BLE_CMD_SET_TIME = 0x03;
const BLE_CMD_SET_QUESTION = 0x04;
const BLE_CMD_SET_ANSWER = 0x05;
// Snapshot relay (device-state GET response, chunked to the device):
const BLE_CMD_SYNC_BEGIN = 0x08; // payload: total byte length, u16 LE
const BLE_CMD_SYNC_CHUNK = 0x09;
const BLE_CMD_SYNC_END = 0x0a;

const SAMPLE_RATE_HZ = 16000; // must match MIC_SAMPLE_RATE_HZ in main/mic.c
const MAX_TEXT_BYTES = 200;   // matches gatt_svr.c write buffer
const TIME_RESYNC_MS = 5 * 60 * 1000;
const SNAPSHOT_RESYNC_MS = 60 * 1000;
const SYNC_CHUNK_BYTES = 180;      // opcode + 180 stays under the firmware's 220B write buffer
const REALTIME_DEBOUNCE_MS = 2000; // Realtime bursts (multi-row edits) collapse to one push

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
  /** ms epoch of the last snapshot successfully pushed to the device */
  lastSyncAt: number | null;
}

type Listener = (state: BridgeState) => void;

// ── Singleton manager ─────────────────────────────────────────────────────────
class BleBridgeManager {
  private manager: BleManager | null = null;
  private device: Device | null = null;
  private audioSub: Subscription | null = null;
  private actionSub: Subscription | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private syncTimerId: ReturnType<typeof setInterval> | null = null;
  private realtimeDebounce: ReturnType<typeof setTimeout> | null = null;
  private realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
  private syncInFlight = false;
  private noteMode = false; // next audio session is a vault capture, not a question
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
    lastSyncAt: null,
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
    this.actionSub?.remove();
    this.actionSub = null;
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    if (this.syncTimerId) { clearInterval(this.syncTimerId); this.syncTimerId = null; }
    if (this.realtimeDebounce) { clearTimeout(this.realtimeDebounce); this.realtimeDebounce = null; }
    if (this.realtimeChannel) { supabase.removeChannel(this.realtimeChannel); this.realtimeChannel = null; }
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
        this.actionSub?.remove();
        this.actionSub = null;
        if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        if (this.syncTimerId) { clearInterval(this.syncTimerId); this.syncTimerId = null; }
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

      // Device-emitted actions (task/habit taps, gym check-in, focus logs).
      // Subscribing also triggers the device to drain its offline queue.
      this.actionSub = connected.monitorCharacteristicForService(
        SERVICE_UUID, ACTION_CHAR_UUID, (err, char) => {
          if (err || !char?.value) return;
          this._onDeviceAction(char.value).catch(e =>
            console.warn('[ble-bridge] action relay error:', e?.message));
        }
      );

      await this._syncTime(connected);
      this.timerId = setInterval(() => {
        if (this.device) this._syncTime(this.device).catch(() => {});
      }, TIME_RESYNC_MS);

      // Snapshot push: on connect, then every minute, plus Realtime-triggered
      // pushes when the user's tasks change in the app.
      this._pushSnapshot().catch(() => {});
      this.syncTimerId = setInterval(() => {
        this._pushSnapshot().catch(() => {});
      }, SNAPSHOT_RESYNC_MS);
      this._startRealtimeTrigger().catch(() => {});

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
    const isNote = this.noteMode;
    this.noteMode = false;

    if (captured.length < 1600) return; // < 0.1s — likely silence, skip

    this.emit({ status: 'processing' });

    try {
      const base64Wav = pcmToWavBase64(captured, SAMPLE_RATE_HZ);
      const transcript = await transcribeViaSupabase(base64Wav);
      if (!transcript) {
        this.emit({ status: 'connected' });
        return;
      }

      // Vault capture: either the BRAIN screen started this session in note
      // mode, or the user said "note ..." to the ASK screen. Either way the
      // transcript is saved, not asked.
      const spokenNote = /^note[:,]?\s+/i.exec(transcript);
      if (isNote || spokenNote) {
        const text = spokenNote ? transcript.slice(spokenNote[0].length) : transcript;
        this.emit({ lastQuestion: transcript });
        if (this.device) await writeCmd(this.device, BLE_CMD_SET_QUESTION, transcript);
        const { error } = await supabase.functions.invoke('device-state', {
          body: {
            actions: [{ op: 'capture_note', text }],
            tzOffsetMinutes: new Date().getTimezoneOffset(),
          },
        });
        const confirm = error ? 'Could not save the note.' : 'Saved to vault.';
        this.emit({ lastAnswer: confirm });
        if (this.device) await writeCmd(this.device, BLE_CMD_SET_ANSWER, confirm);
        return;
      }

      const question = transcript;
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

  // ── pairing / provisioning ─────────────────────────────────────────────────

  /** Write Wi-Fi credentials + a device-owned Supabase refresh token to the
   *  provisioning characteristic. Requires an active connection (call
   *  start() first). The characteristic is encrypted-write-only on the
   *  device, so the OS raises its bonding prompt on first use. */
  async provisionDevice(opts: { ssid: string; psk: string; refreshToken: string }) {
    if (!this.device) throw new Error('Not connected — connect to the device first.');

    const enc = new TextEncoder();
    const parts: Array<{ t: number; v: Uint8Array }> = [
      { t: PROV_TLV_SSID, v: enc.encode(opts.ssid) },
      { t: PROV_TLV_PSK, v: enc.encode(opts.psk) },
      { t: PROV_TLV_REFRESH_TOKEN, v: enc.encode(opts.refreshToken) },
      {
        t: PROV_TLV_TZ_OFFSET,
        v: (() => {
          const tz = new Date().getTimezoneOffset();
          return new Uint8Array([tz & 0xff, (tz >> 8) & 0xff]);
        })(),
      },
    ];
    for (const p of parts) {
      if (p.v.length > 255) throw new Error('Provisioning field too long');
    }
    const total = parts.reduce((s, p) => s + 2 + p.v.length, 0);
    if (total > 220) throw new Error('Provisioning payload exceeds device write buffer');

    const tlv = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      tlv[off++] = p.t;
      tlv[off++] = p.v.length;
      tlv.set(p.v, off);
      off += p.v.length;
    }

    await this.device.writeCharacteristicWithResponseForService(
      SERVICE_UUID, PROV_CHAR_UUID, bytesToBase64(tlv));
  }

  // ── device-state sync relay ────────────────────────────────────────────────

  /** Fetch the device-state snapshot. supabase-js functions.invoke is
   *  POST-only, and GET-with-query is the shared contract with the future
   *  Wi-Fi-direct firmware path, so this uses raw fetch. */
  private async _fetchSnapshot(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const tz = new Date().getTimezoneOffset();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/device-state?tz=${tz}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (!res.ok) {
      console.warn('[ble-bridge] device-state GET failed:', res.status);
      return null;
    }
    return await res.text();
  }

  /** Push a fresh snapshot to the device as SYNC_BEGIN/CHUNK.../END writes. */
  private async _pushSnapshot() {
    if (!this.device || this.syncInFlight) return;
    this.syncInFlight = true;
    try {
      const json = await this._fetchSnapshot();
      const device = this.device;
      if (!json || !device) return;

      const bytes = new TextEncoder().encode(json);
      if (bytes.length > 4096) { // firmware SYNC_BUF_MAX — should never happen (~1-2KB)
        console.warn('[ble-bridge] snapshot too large:', bytes.length);
        return;
      }

      const begin = new Uint8Array([BLE_CMD_SYNC_BEGIN, bytes.length & 0xff, bytes.length >> 8]);
      await device.writeCharacteristicWithResponseForService(
        SERVICE_UUID, CMD_CHAR_UUID, bytesToBase64(begin));

      for (let off = 0; off < bytes.length; off += SYNC_CHUNK_BYTES) {
        const slice = bytes.slice(off, off + SYNC_CHUNK_BYTES);
        const chunk = new Uint8Array(1 + slice.length);
        chunk[0] = BLE_CMD_SYNC_CHUNK;
        chunk.set(slice, 1);
        await device.writeCharacteristicWithResponseForService(
          SERVICE_UUID, CMD_CHAR_UUID, bytesToBase64(chunk));
      }

      await device.writeCharacteristicWithResponseForService(
        SERVICE_UUID, CMD_CHAR_UUID, bytesToBase64(new Uint8Array([BLE_CMD_SYNC_END])));
      this.emit({ lastSyncAt: Date.now() });
    } catch (e: any) {
      console.warn('[ble-bridge] snapshot push failed:', e?.message);
    } finally {
      this.syncInFlight = false;
    }
  }

  /** One notify = one JSON action from the device. Relay it to device-state,
   *  then push a fresh snapshot so the device reconciles its optimistic UI. */
  private async _onDeviceAction(base64: string) {
    const text = new TextDecoder().decode(base64ToBytes(base64));
    let action: any;
    try {
      action = JSON.parse(text);
    } catch {
      console.warn('[ble-bridge] malformed device action:', text);
      return;
    }
    // Local control message, not a server write: the BRAIN screen flags the
    // NEXT audio session as a vault capture rather than an ASK question.
    if (action?.op === 'capture_start') {
      this.noteMode = true;
      return;
    }
    // Context injection: the device says which tab the question came from;
    // route it to the matching companion (each companion already reads the
    // right contextSources, so this IS the context bias — no server change).
    if (action?.op === 'ask_context') {
      const tabToCompanion: Record<string, string> = {
        HUB: 'habitCoach', TIMER: 'focus', TASKS: 'life', GYM: 'gym',
        HABITS: 'habitCoach', RUN: 'activity', BRAIN: 'habitCoach',
      };
      const mapped = tabToCompanion[String(action.tab ?? '')];
      if (mapped) this._companionType = mapped;
      return;
    }
    const { error } = await supabase.functions.invoke('device-state', {
      body: { actions: [action], tzOffsetMinutes: new Date().getTimezoneOffset() },
    });
    if (error) {
      console.warn('[ble-bridge] device-state POST failed:', error.message);
      return;
    }
    await this._pushSnapshot();
  }

  /** Re-push the snapshot when the user's tasks change in the app (same
   *  Realtime pattern as lib/use-remote-task-sync.ts). Habit/gym edits ride
   *  the 60s poll — only `tasks` is in the realtime publication. */
  private async _startRealtimeTrigger() {
    if (this.realtimeChannel) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    supabase.realtime.setAuth(session.access_token);
    this.realtimeChannel = supabase
      .channel(`device-sync-${session.user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${session.user.id}` },
        () => {
          if (this.realtimeDebounce) clearTimeout(this.realtimeDebounce);
          this.realtimeDebounce = setTimeout(() => {
            this._pushSnapshot().catch(() => {});
          }, REALTIME_DEBOUNCE_MS);
        })
      .subscribe();
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
