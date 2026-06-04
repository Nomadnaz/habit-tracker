import { View, StyleSheet } from 'react-native';

const PX = 2;

/** Tiny 8-bit map pin (head + point). */
export function PixelLocationPin({ color = '#FF4D00' }: { color?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.head, { backgroundColor: color }]} />
      <View style={styles.stem}>
        <View style={[styles.stemPx, { backgroundColor: color }]} />
        <View style={[styles.stemPx, styles.stemGap, { backgroundColor: color }]} />
        <View style={[styles.tip, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: PX * 5,
    alignItems: 'center',
    marginRight: 4,
    marginTop: 1,
  },
  head: {
    width: PX * 4,
    height: PX * 4,
    borderRadius: PX,
  },
  stem: {
    alignItems: 'center',
    marginTop: -PX,
  },
  stemPx: {
    width: PX,
    height: PX,
  },
  stemGap: {
    marginTop: 0,
  },
  tip: {
    width: PX,
    height: PX,
    marginTop: 0,
    transform: [{ rotate: '45deg' }],
  },
});
