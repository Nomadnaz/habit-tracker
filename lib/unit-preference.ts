import { useEffect, useState } from 'react';
import { AsyncStorage } from '@react-native-async-storage/async-storage';

export type UnitSystem = 'metric' | 'imperial';

const UNIT_PREF_KEY = '@unit_preference';

let currentUnitSystem: UnitSystem = 'metric';
let loaded = false;
const listeners = new Set<(u: UnitSystem) => void>();

async function loadFromStorage() {
  if (loaded) return currentUnitSystem;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(UNIT_PREF_KEY);
    if (raw === 'metric' || raw === 'imperial') {
      currentUnitSystem = raw;
    }
  } catch {
    // Keep default metric when storage read fails.
  }
  return currentUnitSystem;
}

function notifyAll() {
  listeners.forEach(fn => fn(currentUnitSystem));
}

export async function setGlobalUnitSystem(next: UnitSystem) {
  currentUnitSystem = next;
  notifyAll();
  try {
    await AsyncStorage.setItem(UNIT_PREF_KEY, next);
  } catch {
    // Keep in-memory value even if persistence fails.
  }
}

export function getGlobalUnitSystem() {
  return currentUnitSystem;
}

export function useUnitPreference() {
  const [unitSystem, setUnitSystemState] = useState<UnitSystem>(currentUnitSystem);

  useEffect(() => {
    let mounted = true;
    loadFromStorage().then(value => {
      if (mounted) setUnitSystemState(value);
    });

    const handler = (next: UnitSystem) => setUnitSystemState(next);
    listeners.add(handler);
    return () => {
      mounted = false;
      listeners.delete(handler);
    };
  }, []);

  return {
    unitSystem,
    setUnitSystem: setGlobalUnitSystem,
  };
}

export function kgToLb(kg: number) {
  return kg * 2.2046226218;
}

export function lbToKg(lb: number) {
  return lb / 2.2046226218;
}

export function weightUnitLabel(unit: UnitSystem = getGlobalUnitSystem()) {
  return unit === 'imperial' ? 'LB' : 'KG';
}

/** Display weight from stored kg with at most one decimal place. */
export function formatWeightFromKg(kg: number, unit: UnitSystem = getGlobalUnitSystem()) {
  if (!Number.isFinite(kg)) return '0';
  if (unit === 'imperial') {
    const lb = kgToLb(kg);
    const rounded = Math.round(lb * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  const rounded = Math.round(kg * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatWeightWithUnit(kg: number, unit: UnitSystem = getGlobalUnitSystem()) {
  return `${formatWeightFromKg(kg, unit)}${weightUnitLabel(unit)}`;
}

export function parseWeightToKg(value: string, unit: UnitSystem) {
  const num = parseFloat(value);
  if (Number.isNaN(num)) return null;
  return unit === 'imperial' ? lbToKg(num) : num;
}

export function convertWeightText(value: string, from: UnitSystem, to: UnitSystem) {
  const kg = parseWeightToKg(value, from);
  if (kg == null) return value;
  return formatWeightFromKg(kg, to);
}
