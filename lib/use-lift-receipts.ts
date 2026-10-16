// Opens the LIFT RECEIPT (app/lift-receipt.tsx) whenever the puck finishes a
// set. A set for the session already on screen just updates that receipt;
// a set for a different exercise swaps the receipt over.
import { useEffect } from 'react';
import { router } from 'expo-router';
import { getOpenReceipt, onLiftSession } from '@/lib/lift-sessions';

export function useLiftReceipts(): void {
  useEffect(() => onLiftSession((s, kind) => {
    if (kind !== 'set') return;
    const open = getOpenReceipt();
    if (open === s.id) return;
    const to = { pathname: '/lift-receipt' as const, params: { id: s.id } };
    if (open) router.replace(to); else router.push(to);
  }), []);
}
