// Mounted once in app/_layout.tsx, above every screen: the chat sheet and
// the REC overlay that the PUCK dot (tab bar) and the composer drive.
import { useEffect } from 'react';
import { loadThreads } from '@/lib/assistant';
import { ChatSheet } from './ChatSheet';
import { RecOverlay } from './RecOverlay';

export function AssistantHost() {
  useEffect(() => { void loadThreads(); }, []);
  return (
    <>
      <ChatSheet />
      <RecOverlay />
    </>
  );
}
