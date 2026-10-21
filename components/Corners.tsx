// The four bracket corners of a lit box — the PUCK "boxy overlay". Drop it
// inside any View (it positions itself absolutely and takes no touches).

import { View } from 'react-native';

export function Corners({ size = 8, color, weight = 2 }: { size?: number; color: string; weight?: number }) {
  const c = { position: 'absolute' as const, width: size, height: size, borderColor: color };
  return (
    <>
      <View pointerEvents="none" style={[c, { left: 0, top: 0, borderLeftWidth: weight, borderTopWidth: weight }]} />
      <View pointerEvents="none" style={[c, { right: 0, top: 0, borderRightWidth: weight, borderTopWidth: weight }]} />
      <View pointerEvents="none" style={[c, { left: 0, bottom: 0, borderLeftWidth: weight, borderBottomWidth: weight }]} />
      <View pointerEvents="none" style={[c, { right: 0, bottom: 0, borderRightWidth: weight, borderBottomWidth: weight }]} />
    </>
  );
}
