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

// Type-only import (erased at runtime). The BleManager class itself is
// lazy-required in getBleManager(): expo-router eagerly loads every route at
// boot, and app/ble-bridge.tsx + app/pair-device.tsx import this module, so a
// top-level value import of react-native-ble-plx crashes the whole app at
// launch wherever the native module is absent (Expo Go). Same pattern as
// lib/apple-health.ts and lib/locationTask.ts.
import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { adpcmDecode, makeAdpcmState, type AdpcmState } from '@/lib/adpcm';
import { reconcile as reconcileRemoteTasks } from '@/lib/use-remote-task-sync';
import { toDateKey } from '@/lib/dateKey';
import { RepAssembler, recordLiftSet } from '@/lib/lift-sessions';

// Set once a BLE connection has ever succeeded. Gates auto-connect-on-launch
// (below) so a user who has never owned/paired the physical device doesn't
// get a silent background BLE scan + permission prompt on every app open.
const EVER_CONNECTED_KEY = '@ble_ever_connected';
// Set once provisionDevice() has ever sent a refresh token (i.e. the device
// has an account login, not just a Wi-Fi network). Lets the pairing screen
// skip re-asking for the account password on every later "add a network"
// visit -- the device already has what it needs, only SSID/PSK is new.
const DEVICE_PROVISIONED_KEY = '@device_provisioned';
// The puck's CoreBluetooth id, remembered after the first connection so later
// connects can be a standing request to that exact peripheral (see _connectLoop).
const KNOWN_DEVICE_ID_KEY = '@ble_device_id';
export async function isDeviceProvisioned(): Promise<boolean> {
  return (await AsyncStorage.getItem(DEVICE_PROVISIONED_KEY)) === '1';
}
// iOS-only: identifies this BleManager instance to CoreBluetooth's state
// restoration, letting the OS relaunch the app in the background (app
// merely backgrounded/suspended, NOT force-quit -- iOS never restores a
// force-quit app) when the already-connected device sends data. Paired with
// app.json's react-native-ble-plx plugin: isBackgroundEnabled/modes:["central"].
const RESTORE_STATE_ID = 'companion-hud-bridge';

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
const PROV_TLV_NET_LABEL = 0x05; // "home" / "hotspot" — must match ble_svc.h

const BLE_CMD_SET_TIME = 0x03;
const BLE_CMD_SET_QUESTION = 0x04;
const BLE_CMD_SET_ANSWER = 0x05;
// Snapshot relay (device-state GET response, chunked to the device):
const BLE_CMD_SYNC_BEGIN = 0x08; // payload: total byte length, u16 LE
const BLE_CMD_SYNC_CHUNK = 0x09;
const BLE_CMD_SYNC_END = 0x0a;
// Voice-driven lift_begin() -- see companion-hud's ble_svc.h for the wire
// format (weight_kg as a 4-byte LE float, then the exercise name as UTF-8).
const BLE_CMD_LIFT_BEGIN = 0x0b;
const PENDING_LIFT_MS = 4 * 60 * 60 * 1000; // SEND TO PUCK tag lifetime

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
  /** From the puck's "hello" on connect: does it still have its own cloud
   *  login (Wi-Fi path)? null until it has said. */
  deviceProvisioned: boolean | null;
  deviceWifi: boolean | null;
}

type Listener = (state: BridgeState) => void;

// ── Singleton manager ─────────────────────────────────────────────────────────

/** The puck's BODY and FUEL pages (firmware screen_body.c / screen_fuel.c)
 *  show what only the phone knows: the twin's targets, muscle recovery and
 *  the watch's vitals. The server's snapshot has none of it, so it's merged
 *  in here from TODAY's last computed view (lib/twin-data cachedView, null
 *  once it's from another day). Compact on purpose: the whole snapshot has
 *  to fit the firmware's 4 KB buffer.
 *    t = targets  [kcal, protein g, water ml, steps, sleep min]
 *    n = so far   [kcal, protein g, water ml, steps, sleep min, rhr, hrv, kg×10]
 *    m = recovery % per group, lib/twin.ts GROUPS order
 *        (chest back delts arms abs quads hams glutes calves) */
async function withBodyBlock(json: string): Promise<string> {
  try {
    const { cachedView } = await import('@/lib/twin-data');
    const { goalWord } = await import('@/lib/twin');
    const v = await cachedView();
    if (!v) return json;
    const { twin: t, today, now } = v;
    const r = (x: number | null | undefined) => (x == null || !isFinite(x) ? null : Math.round(x));
    const body = {
      goal: goalWord(t.goal.id),
      eta: r(t.outlook.weeks),
      plan: today.scheduled && !today.done ? today.focus.toUpperCase() : today.done ? 'DONE' : 'REST',
      fresh: r(today.fresh),
      t: [r(t.fuel.value), r(t.fuel.proteinG), r(t.water.value), r(t.steps.value), r(t.sleep.value)],
      n: [r(now.kcal), r(now.proteinG), r(now.waterMl), r(now.steps), r(now.sleepMin), r(now.rhr), r(now.hrv),
          now.weightKg == null ? null : Math.round(now.weightKg * 10)],
      m: t.groups.map(g => Math.round(g.pct)),
    };
    const snap = JSON.parse(json);
    snap.body = body;
    return JSON.stringify(snap);
  } catch (e: any) {
    console.warn('[ble-bridge] body block skipped:', e?.message);
    return json;
  }
}

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
  private liftSetupMode = false; // next audio session starts a lift, not a question
  private repChunks = new RepAssembler(); // a set's rep-by-rep numbers, ahead of its log_set
  private _attachedId: string | null = null; // device id currently subscribed -- guards double-attach
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
    deviceProvisioned: null,
    deviceWifi: null,
  };
  private _stopping = false;
  private _looping = false;      // single-flight guard for _connectLoop
  private _relinkPrompted = false;

  // SEND TO PUCK: the exercise the app last started on the puck. The puck only
  // knows the name, so sets it reports back under that name get this id and
  // day attached before the relay -- they land on the exercise you tapped, not
  // whatever the server's name matcher picks. Kept for a few hours (not
  // cleared after one set) because the puck's own START button runs the next
  // set under the same name.
  private pendingLift: { exerciseId: string; name: string; date: string; at: number } | null = null;
  private setListeners = new Set<(exerciseId: string) => void>();

  get companionType() { return this._companionType; }

  /** Send an exercise to the puck: it jumps to LIFT and starts the countdown.
   *  Resolves false if no puck is connected. */
  async sendToPuck(exerciseId: string, name: string, weightKg: number): Promise<boolean> {
    const busy = this._state.status === 'listening' || this._state.status === 'processing';
    if (!this.device || !(this._state.status === 'connected' || busy)) return false;
    const label = name.trim().toUpperCase();
    await writeLiftBegin(this.device, weightKg > 0 ? weightKg : 0, label);
    this.pendingLift = { exerciseId, name: label, date: toDateKey(new Date()), at: Date.now() };
    return true;
  }

  /** Called with the exercise id whenever a set started from the app has
   *  been saved, so an open screen can refresh its list. */
  onSetLogged(fn: (exerciseId: string) => void): () => void {
    this.setListeners.add(fn);
    return () => this.setListeners.delete(fn);
  }
  getState(): BridgeState { return this._state; }
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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { BleManager: BleManagerClass } = require('react-native-ble-plx');
        this.manager = new BleManagerClass({
          restoreStateIdentifier: RESTORE_STATE_ID,
          restoreStateFunction: (restoredState: { peripherals: Device[] } | null) => {
            const restored = restoredState?.peripherals?.[0];
            if (restored) this._attachToDevice(restored).catch(() => {});
          },
        }) as BleManager;
      } catch {
        throw new Error('BLE native module not available. A dev build (not Expo Go) is required.');
      }
    }
    return this.manager;
  }

  /** Connect and STAY connected: retries forever, reconnects on every drop.
   *  Safe to call any number of times. `force` (the CONNECT button) abandons
   *  whatever attempt is in flight and starts a fresh one. */
  async start(force = false) {
    this._stopping = false;
    if (this.device) return;
    if (force && this._looping) {
      try { this.manager?.stopDeviceScan(); } catch { /* not scanning */ }
      const knownId = await AsyncStorage.getItem(KNOWN_DEVICE_ID_KEY);
      if (knownId) await this.manager?.cancelDeviceConnection(knownId).catch(() => {});
      this._looping = false;
    }
    void this._connectLoop();
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
    try { this.manager?.stopDeviceScan(); } catch { /* not scanning */ }
    this.device?.cancelConnection().catch(() => {});
    this.device = null;
    this.samples = [];
    this.adpcmState = makeAdpcmState();
    this.emit({ status: 'idle', error: null });
  }

  /**
   * The old flow (scan 20 s, connect once) had three dead ends, all reported
   * on hardware as "takes two tries" / "won't reconnect until I force quit":
   *   - a scan that missed the puck (asleep, rebooting, out of range) ended
   *     in 'error' and nothing ever retried;
   *   - one failed connect (often the very first, while iOS sets up the
   *     encrypted bond, or before the radio reports PoweredOn) also ended in
   *     'error';
   *   - device.connect() has no timeout on iOS, so a puck that vanished
   *     mid-connect left status 'connecting' forever -- and start() and the
   *     auto-connect hook both ignored any request while not idle/error.
   * Now: wait for PoweredOn, then race a standing connect to the remembered
   * peripheral (CoreBluetooth completes it whenever the puck shows up, the
   * way earphones reconnect) against a scan (first pairing, or the id
   * changed). Any failure retries after a short pause; it never gives up.
   */
  private async _connectLoop() {
    if (this._looping || this._stopping || this.device) return;
    this._looping = true;
    let ble: BleManager;
    try {
      ble = this.getBleManager();
    } catch (e: any) {
      this._looping = false;
      this.emit({ status: 'error', error: e?.message ?? 'BLE unavailable' });
      return;
    }
    try {
      await this._poweredOn(ble);
      if (this._stopping) return;
      this.emit({ status: 'connecting', error: null });
      const knownId = await AsyncStorage.getItem(KNOWN_DEVICE_ID_KEY);
      const device = await this._findAndConnect(ble, knownId);
      if (this._stopping) { device.cancelConnection().catch(() => {}); return; }
      await this._attachToDevice(device);
      void AsyncStorage.setItem(KNOWN_DEVICE_ID_KEY, device.id);
    } catch (e: any) {
      console.warn('[ble-bridge] connect attempt failed, retrying:', e?.message);
      // A half-finished attach (e.g. the first write failing while iOS
      // bonds) must not leave live subscriptions or a dangling link behind.
      this.audioSub?.remove(); this.audioSub = null;
      this.actionSub?.remove(); this.actionSub = null;
      (this.device as Device | null)?.cancelConnection().catch(() => {}); // TS narrows to null across the awaits
      this.device = null;
      this._attachedId = null;
    } finally {
      this._looping = false;
    }
    if (!this.device && !this._stopping) setTimeout(() => void this._connectLoop(), 2000);
  }

  /** Resolves once Bluetooth is on (immediately if it already is). */
  private _poweredOn(ble: BleManager): Promise<void> {
    return new Promise((resolve) => {
      const sub = ble.onStateChange((s) => {
        if (s === 'PoweredOn') { sub.remove(); resolve(); }
        else if (s === 'PoweredOff') this.emit({ status: 'error', error: 'Bluetooth is off.' });
        else if (s === 'Unauthorized') this.emit({ status: 'error', error: 'Bluetooth permission is off for this app.' });
      }, true);
    });
  }

  /** First connected puck wins: the standing connect to `knownId`, or one
   *  found by scanning. Rejects only on a real connect failure (the loop
   *  retries); simply not finding the puck keeps waiting. */
  private _findAndConnect(ble: BleManager, knownId: string | null): Promise<Device> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const win = (d: Device) => {
        if (settled) { d.cancelConnection().catch(() => {}); return; }
        settled = true;
        try { ble.stopDeviceScan(); } catch { /* not scanning */ }
        resolve(d);
      };
      const fail = (e: unknown) => {
        if (settled) return;
        settled = true;
        try { ble.stopDeviceScan(); } catch { /* not scanning */ }
        reject(e);
      };
      // requestMTU is Android-only (iOS negotiates ~185 itself); the 181-byte
      // SYNC chunks need ATT_MTU >= 184, Android's default 23 fails them.
      const connectTo = (id: string, timeout?: number) =>
        ble.connectToDevice(id, { requestMTU: 247, ...(timeout ? { timeout } : {}) })
          .then((d) => d.discoverAllServicesAndCharacteristics());

      let knownPending = false;
      if (knownId) {
        knownPending = true;
        connectTo(knownId).then(win, () => { knownPending = false; });
      }

      ble.startDeviceScan(null, { allowDuplicates: false }, (err, d) => {
        if (err || settled || !d) return;
        const isPuck = d.name === DEVICE_NAME || d.localName === DEVICE_NAME
          || (d.serviceUUIDs ?? []).includes(SERVICE_UUID);
        if (!isPuck) return;
        try { ble.stopDeviceScan(); } catch { /* not scanning */ }
        if (knownPending && d.id === knownId) {
          // It's advertising, so the standing connect should land now. If
          // CoreBluetooth sits on it, cancel and connect afresh.
          setTimeout(() => {
            if (settled) return;
            ble.cancelDeviceConnection(d.id).catch(() => {})
              .then(() => connectTo(d.id, 10_000)).then(win, fail);
          }, 5000);
          return;
        }
        const switchFrom = knownPending && knownId ? ble.cancelDeviceConnection(knownId).catch(() => {}) : Promise.resolve();
        switchFrom.then(() => connectTo(d.id, 10_000)).then(win, fail);
      });
    });
  }

  /** Shared post-connection wiring: subscriptions, timers, snapshot push.
   *  Used both by a fresh _connect() and by iOS state restoration, where the
   *  device is already connected (a background BLE event relaunched the app)
   *  and only needs its characteristic monitors re-attached — the OS does
   *  not preserve JS-side listeners across a relaunch. */
  private async _attachToDevice(device: Device) {
    // Guards against attaching twice to the SAME live connection — found on
    // hardware 2026-09-03: iOS state restoration (getBleManager's
    // restoreStateFunction) can hand back an already-connected peripheral
    // concurrently with the normal _connect() path also reaching here for
    // the same device (both plausible right at app launch). Each call to
    // monitorCharacteristicForService below creates a fresh subscription,
    // so attaching twice raced two subscribe attempts on the action
    // characteristic — observed as the CCCD flipping enabled then disabled
    // ~200ms later and STAYING disabled, silently dropping every
    // device-originated action (ask_context, complete_task, ...) for the
    // rest of the connection with zero error anywhere. Real subscriptions
    // already present for this exact device id -> nothing to do.
    if (this._attachedId === device.id && this.actionSub && this.audioSub) {
      this.device = device;
      return;
    }
    this._attachedId = device.id;

    // State restoration can hand back a peripheral whose GATT cache didn't
    // survive the relaunch; re-discovering is a no-op if it did.
    const connected = await device.discoverAllServicesAndCharacteristics();
    this.device = connected;

    connected.onDisconnected(() => {
      if (this._stopping) return;
      this.audioSub?.remove();
      this.audioSub = null;
      this.actionSub?.remove();
      this.actionSub = null;
      this._attachedId = null;
      if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
      if (this.syncTimerId) { clearInterval(this.syncTimerId); this.syncTimerId = null; }
      this.device = null;
      this.samples = [];
      this.adpcmState = makeAdpcmState();
      this.emit({ status: 'connecting', deviceProvisioned: null, deviceWifi: null });
      // Straight back to a standing reconnect -- see _connectLoop.
      if (!this._stopping) void this._connectLoop();
    });

    this.audioSub = connected.monitorCharacteristicForService(
      SERVICE_UUID, AUDIO_CHAR_UUID, (err, char) => {
        if (err || !char?.value) return;
        this._onAudioFrame(char.value);
      }
    );

    // Device-emitted actions (task/habit taps, gym check-in, focus logs,
    // measured gym sets). Subscribing also triggers the device to drain its
    // offline queue — see companion-hud's sync.c.
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

    void AsyncStorage.setItem(EVER_CONNECTED_KEY, '1');
    this.emit({ status: 'connected' });
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
    const isLiftSetup = this.liftSetupMode;

    if (captured.length < 1600) return; // < 0.1s — likely silence, skip

    this.emit({ status: 'processing' });

    try {
      const base64Wav = pcmToWavBase64(captured, SAMPLE_RATE_HZ);
      const transcript = await transcribeViaSupabase(base64Wav);
      if (!transcript) {
        this.emit({ status: 'connected' });
        return;
      }

      // Hold-to-talk from the LIFT tab: "tricep pulldown, twenty kilos"
      // starts a set, it isn't a question or a log entry — parsed by a
      // dedicated tiny endpoint (no DB writes, so it doesn't share
      // device-log's items/kind schema) and sent back as a command the
      // firmware turns straight into lift_begin(), not spoken prose.
      if (isLiftSetup) {
        await this._tryLiftSetup(transcript);
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

      // Logging first, conversation second. Most of what gets said to this
      // device is "log X", and ai-chat cannot do that -- it gates actions
      // rather than executing them, so it answers "I can't add that to your
      // app" (reported on hardware 2026-08-28). device-log writes, and tells
      // us when the utterance wasn't a log at all so we can fall through.
      const answer = (await this._tryDeviceLog(question)) ?? (await this._callAiChat(question));
      this.emit({ lastAnswer: answer });
      if (this.device) await writeCmd(this.device, BLE_CMD_SET_ANSWER, answer);
      // Both paths above write server-side (execute:true) — including
      // create_task. Apple Calendar/Reminders sync for a server-written task
      // only ever runs from use-remote-task-sync's reconcile(), which used to
      // fire incidentally because using the device required opening the app
      // (see the auto-reconnect work above — that's no longer true, so the
      // implicit trigger is gone and has to be explicit here instead).
      void this._reconcileTasksAfterAction();
      // Same reasoning as _onDeviceAction: without this the HUB's kcal/water
      // totals only refresh on the 60s syncTimerId tick (or a `tasks` realtime
      // event, which meals/water aren't part of) — reported on hardware as
      // "took ages to appear" after a voice-logged meal.
      await this._pushSnapshot();

      this.history.push({ role: 'user', content: question });
      this.history.push({ role: 'assistant', content: answer });
      if (this.history.length > 20) this.history = this.history.slice(-20);
    } catch (e: any) {
      console.warn('[ble-bridge] session error:', e?.message);
    } finally {
      if (!this._stopping) this.emit({ status: 'connected' });
    }
  }

  /**
   * Returns the spoken confirmation when the utterance was a log, or null when
   * it wasn't and the caller should ask ai-chat instead.
   *
   * Never throws: a logging outage must degrade to conversation, not break
   * hold-to-talk entirely.
   */
  private async _tryDeviceLog(question: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.functions.invoke('device-log', {
        body: {
          transcript: question,
          // The phone knows the user's timezone; the ESP32 does not. Same
          // reasoning as _callAiChat below -- the server writes real dated
          // rows, so a wrong offset files today's lunch under yesterday.
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        },
      });
      if (error) throw error;
      if (!data?.handled) return null;
      return (data.speech ?? '').trim() || null;
    } catch (e: any) {
      console.warn('[ble-bridge] device-log failed, falling back to ai-chat:', e?.message);
      return null;
    }
  }

  /**
   * Never throws (found on hardware 2026-09-03: it used to `throw error` on
   * any non-2xx response -- e.g. a 429 from FREE_DAILY_CAP -- with no
   * try/catch here or in the caller's synchronous chain up to the BLE
   * write, so the device got NOTHING at all: no tick, no text, totally
   * blank, with the failure only ever visible as a console.warn on the
   * phone nobody was looking at). This device has no other way to learn a
   * request failed, so a failure has to still produce a real spoken/shown
   * line, same as a genuine answer would.
   */
  private async _callAiChat(question: string): Promise<string> {
    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          message: question,
          companionType: this._companionType,
          conversationHistory: this.history.slice(-10),
          execute: true, // high-confidence actions execute server-side
          source: 'device', // ai-chat: no confirm screen here, no way to hear a follow-up question either
          // The phone (not the ESP32) sends this — same fix as ChatScreen.tsx,
          // see supabase/functions/_shared/localDate.ts (audit 2026-07-06).
          // Matters more here than in-app: execute:true means the server
          // actually writes the task's date, not just displays it.
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        },
      });
      if (error) throw error;
      return (data?.response ?? '').trim() || "Didn't get a reply — try again.";
    } catch (e: any) {
      console.warn('[ble-bridge] ai-chat failed:', e?.message);
      const status = e?.context?.status ?? e?.status;
      return status === 429 ? "Hit today's AI limit." : "Couldn't reach the AI — try again.";
    }
  }

  /** "tricep pulldown, twenty kilos" -> lift_begin("TRICEP PULLDOWN", 20.0)
   *  on the device. Never throws into the caller (matches _tryDeviceLog) —
   *  a parse failure should say so out loud, not break hold-to-talk. */
  private async _tryLiftSetup(transcript: string): Promise<void> {
    let name = '';
    let weightKg = 0;
    try {
      const { data, error } = await supabase.functions.invoke('lift-setup', {
        body: { transcript },
      });
      if (error) throw error;
      name = String(data?.name ?? '').trim();
      weightKg = typeof data?.weightKg === 'number' ? data.weightKg : 0;
    } catch (e: any) {
      console.warn('[ble-bridge] lift-setup failed:', e?.message);
    }

    const confirm = name
      ? `Starting ${name}${weightKg > 0 ? ` at ${weightKg}kg` : ''}`
      : "Didn't catch the exercise — try again";
    this.emit({ lastQuestion: transcript, lastAnswer: confirm });
    if (this.device) {
      await writeCmd(this.device, BLE_CMD_SET_ANSWER, confirm);
      if (name) await writeLiftBegin(this.device, weightKg, name.toUpperCase());
    }
  }

  private async _syncTime(device: Device) {
    // h, m, s, then year (LE u16), month (1-12), day. The puck has no RTC, so
    // this is its only source of the calendar date (the log home screen's
    // year-of-dots needs it). Firmware also accepts the old 4-byte form.
    const now = new Date();
    const year = now.getFullYear();
    const payload = new Uint8Array([
      BLE_CMD_SET_TIME,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      year & 0xff,
      (year >> 8) & 0xff,
      now.getMonth() + 1,
      now.getDate(),
    ]);
    await device.writeCharacteristicWithResponseForService(
      SERVICE_UUID, CMD_CHAR_UUID, bytesToBase64(payload)
    );
  }

  // ── pairing / provisioning ─────────────────────────────────────────────────

  /** Write one saved network's Wi-Fi credentials (+ optionally a
   *  device-owned Supabase refresh token, first pairing only) to the
   *  provisioning characteristic. Requires an active connection (call
   *  start() first). The characteristic is encrypted-write-only on the
   *  device, so the OS raises its bonding prompt on first use.
   *
   *  `label` identifies which saved-network slot this is ("home"/"hotspot")
   *  — the device matches on it to update rather than duplicate a network
   *  when the same label is re-paired. `refreshToken` is account-level, not
   *  per-network: omit it on every call after the very first pairing (the
   *  device already has one; re-sending isn't harmful, just needless BLE
   *  traffic and an extra account-password prompt the user shouldn't need). */
  /** `ssid` omitted = account re-link only: the puck keeps every Wi-Fi
   *  network it already has (firmware skips the Wi-Fi TLVs when absent). */
  async provisionDevice(opts: { ssid?: string; psk?: string; label?: string; refreshToken?: string }) {
    if (!this.device) throw new Error('Not connected — connect to the device first.');

    const enc = new TextEncoder();
    const parts: Array<{ t: number; v: Uint8Array }> = [
      ...(opts.ssid ? [
        { t: PROV_TLV_SSID, v: enc.encode(opts.ssid) },
        { t: PROV_TLV_PSK, v: enc.encode(opts.psk ?? '') },
        { t: PROV_TLV_NET_LABEL, v: enc.encode(opts.label ?? 'home') },
      ] : []),
      {
        t: PROV_TLV_TZ_OFFSET,
        v: (() => {
          const tz = new Date().getTimezoneOffset();
          return new Uint8Array([tz & 0xff, (tz >> 8) & 0xff]);
        })(),
      },
    ];
    if (opts.refreshToken) {
      parts.push({ t: PROV_TLV_REFRESH_TOKEN, v: enc.encode(opts.refreshToken) });
    }
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

    if (opts.refreshToken) {
      void AsyncStorage.setItem(DEVICE_PROVISIONED_KEY, '1');
      this.emit({ deviceProvisioned: true });
    }
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
      const raw = await this._fetchSnapshot();
      const device = this.device;
      if (!raw || !device) return;
      const json = await withBodyBlock(raw);

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
    // Local only: each rep's height and speed for the lift receipt, sent
    // by the puck just ahead of the set's log_set (companion-hud screen_lift.c).
    if (action?.op === 'set_reps') {
      if (typeof action.r === 'string' && Number.isFinite(action.set)) this.repChunks.add(action);
      return;
    }
    // Sent by the puck on every connect. provisioned:false means its own
    // cloud login is gone (the server rejected it and the firmware wiped it),
    // so it only works through this phone. The old @device_provisioned flag
    // stayed '1' regardless and hid the password field, leaving no way to fix
    // it -- trust the device's own report instead.
    if (action?.op === 'hello') {
      const provisioned = action.provisioned === true;
      this.emit({ deviceProvisioned: provisioned, deviceWifi: action.wifi === true });
      if (!provisioned) {
        void AsyncStorage.removeItem(DEVICE_PROVISIONED_KEY);
        if (!this._relinkPrompted) {
          this._relinkPrompted = true;
          Alert.alert(
            'Re-link your puck',
            "It lost its sign-in, so it can only work through this phone. Re-link it once and it works on Wi-Fi by itself.",
            [{ text: 'Later', style: 'cancel' }, { text: 'Re-link', onPress: () => router.push('/pair-device') }],
          );
        }
      }
      return;
    }
    // Context injection: the device says which tab the question came from;
    // route it to the matching companion (each companion already reads the
    // right contextSources, so this IS the context bias — no server change).
    if (action?.op === 'ask_context') {
      const tabToCompanion: Record<string, string> = {
        HUB: 'habitCoach', TIMER: 'focus', TASKS: 'life', GYM: 'gym',
        HABITS: 'habitCoach', RUN: 'activity', BRAIN: 'habitCoach', LIFT: 'gym',
        BODY: 'gym', FUEL: 'calorie',
      };
      const tab = String(action.tab ?? '');
      const mapped = tabToCompanion[tab];
      if (mapped) this._companionType = mapped;
      // A hold-to-talk press made from the LIFT tab means "start a lift" —
      // handled entirely differently in _finishSession (parsed name+weight,
      // sent back as a BLE_CMD_LIFT_BEGIN command, not a spoken answer).
      // This fires on every press, tab-driven, so it never needs resetting
      // the way noteMode does (that one's only sometimes set explicitly).
      this.liftSetupMode = tab === 'LIFT';
      return;
    }
    // A set from an exercise sent with SEND TO PUCK: pin it to that exercise
    // and day. The firmware caps names at 39 bytes, so compare on that.
    const pending = this.pendingLift;
    const tagged = action?.op === 'log_set' && pending
      && Date.now() - pending.at < PENDING_LIFT_MS
      && String(action.exercise ?? '').trim().toUpperCase() === pending.name.slice(0, 39);
    if (tagged) action = { ...action, exercise_id: pending.exerciseId, date: pending.date };
    // The receipt is local, so it prints even if the upload below fails.
    if (action?.op === 'log_set') this._recordLiftSet(action, tagged ? pending : null);
    const { error } = await supabase.functions.invoke('device-state', {
      body: { actions: [action], tzOffsetMinutes: new Date().getTimezoneOffset() },
    });
    if (error) {
      console.warn('[ble-bridge] device-state POST failed:', error.message);
      return;
    }
    if (tagged) this.setListeners.forEach(fn => fn(pending.exerciseId));
    // complete_task/etc. write server-side too — same reconcile gap as the
    // voice path below.
    void this._reconcileTasksAfterAction();
    await this._pushSnapshot();
  }

  /** Keeps a puck set (with its reps, if they all arrived) for the lift
   *  receipt; app/_layout.tsx opens the receipt when one lands. */
  private _recordLiftSet(a: any, pending: { exerciseId: string; date: string } | null) {
    const { reps: repData, ms } = Number.isFinite(a.set) ? this.repChunks.take(a.set) : { reps: null, ms: null };
    const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    const reps = num(a.reps) ?? 0;
    if (reps <= 0) return;
    void recordLiftSet({
      at: new Date().toISOString(), setMs: ms, weightKg: num(a.weight_kg) ?? 0, reps,
      romCm: num(a.rom_cm), peakMps: num(a.peak_velocity_mps), tempoS: num(a.tempo_seconds), repData,
    }, String(a.exercise ?? 'LIFT'), pending?.exerciseId ?? null, pending?.date ?? toDateKey(new Date()))
      .catch(e => console.warn('[ble-bridge] lift receipt save failed:', e?.message));
  }

  /** Apple Calendar/Reminders only gets a server-written task via
   *  use-remote-task-sync's reconcile() — call it directly after any
   *  device-triggered write instead of relying on the app happening to be
   *  foregrounded around the same time. Best-effort: never blocks or throws
   *  into the caller, same reasoning as _pushSnapshot(). */
  private async _reconcileTasksAfterAction() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (userId) await reconcileRemoteTasks(userId);
    } catch (e: any) {
      console.warn('[ble-bridge] post-action reconcile failed:', e?.message);
    }
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

/**
 * Mount once at the app root (RootLayout). Starts the BLE bridge on launch
 * IF this device has connected before (EVER_CONNECTED_KEY) — so a user who
 * has never owned/paired the physical unit never sees a background scan or
 * Bluetooth permission prompt. Also retries whenever the app returns to the
 * foreground and the bridge isn't already connected/connecting: iOS state
 * restoration (see getBleManager above) covers "app was merely backgrounded
 * with an active connection," but a fully-evicted app (memory pressure, or
 * launched fresh after being force-quit — which iOS never auto-relaunches
 * for a BLE event) needs an explicit reconnect attempt, and this is that.
 */
export function useBleAutoConnect() {
  useEffect(() => {
    let cancelled = false;

    async function tryStart() {
      const everConnected = await AsyncStorage.getItem(EVER_CONNECTED_KEY);
      if (cancelled || !everConnected) return;
      bleBridge.start().catch(() => {}); // no-op when connected or already trying
    }

    void tryStart();
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') void tryStart();
    });
    return () => { cancelled = true; sub.remove(); };
  }, []);
}

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

async function writeLiftBegin(device: Device, weightKg: number, name: string) {
  const nameBytes = truncateUtf8(name, MAX_TEXT_BYTES - 5); // opcode(1) + float(4)
  const payload = new Uint8Array(5 + nameBytes.length);
  payload[0] = BLE_CMD_LIFT_BEGIN;
  new DataView(payload.buffer).setFloat32(1, weightKg, true); // true = little-endian
  payload.set(nameBytes, 5);
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
