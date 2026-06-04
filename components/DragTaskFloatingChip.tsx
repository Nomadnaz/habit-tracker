import { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, Animated } from 'react-native';

type DragTaskFloatingChipProps = {
  visible: boolean;
  label: string;
  width: number;
  top: Animated.Value;
  left: Animated.Value;
  danger?: boolean;
  onOverlayOrigin?: (x: number, y: number) => void;
};

/** Full-screen overlay chip — top/left are window coordinates (from measureInWindow). */
export function DragTaskFloatingChip({
  visible,
  label,
  width,
  top,
  left,
  danger,
  onOverlayOrigin,
}: DragTaskFloatingChipProps) {
  const overlayRef = useRef<View>(null);

  useEffect(() => {
    if (!visible || !onOverlayOrigin) return;
    const id = requestAnimationFrame(() => {
      overlayRef.current?.measureInWindow((x, y) => onOverlayOrigin(x, y));
    });
    return () => cancelAnimationFrame(id);
  }, [visible, onOverlayOrigin]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View ref={overlayRef} style={styles.overlay} pointerEvents="none">
        <Animated.View
          style={[
            styles.chip,
            danger && styles.chipDanger,
            { width, top, left },
          ]}
        >
          <Text style={styles.chipText} numberOfLines={2}>
            {label}
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  chip: {
    position: 'absolute',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FCFBF9',
    borderRadius: 8,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 14,
  },
  chipDanger: {
    backgroundColor: '#FFF1F1',
  },
  chipText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 12,
    color: '#1A1714',
    lineHeight: 18,
  },
});
