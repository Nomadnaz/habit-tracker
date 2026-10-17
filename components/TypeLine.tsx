// Text that types itself out, terminal style: one character at a time with
// a block cursor riding the end, which blinks a few times and goes once the
// line is done. Re-types whenever the text changes.

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type TextStyle, type StyleProp } from 'react-native';

export function TypeLine({ text, style, delay = 0, speed = 22, cursor, numberOfLines = 1, go = true, onDone }: {
  text: string;
  style?: StyleProp<TextStyle>;
  /** ms before the first character. */
  delay?: number;
  /** ms per character. */
  speed?: number;
  /** Cursor colour; omit for none. */
  cursor?: string;
  numberOfLines?: number;
  /** Hold the line blank (space still reserved) until true. */
  go?: boolean;
  onDone?: () => void;
}) {
  const [n, setN] = useState(0);
  const blink = useRef(new Animated.Value(1)).current;
  const [showCursor, setShowCursor] = useState(false);

  useEffect(() => {
    setN(0);
    setShowCursor(false);
    if (!go) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i++;
      setN(i);
      if (i < text.length) timer = setTimeout(tick, speed);
      else {
        onDone?.();
        timer = setTimeout(() => setShowCursor(false), 900);
      }
    };
    timer = setTimeout(() => { setShowCursor(!!cursor); tick(); }, delay);
    return () => clearTimeout(timer);
  }, [text, go]);

  useEffect(() => {
    if (!showCursor) return;
    const l = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [showCursor]);

  const size = StyleSheet.flatten(style)?.fontSize ?? 12;
  return (
    // The full line, invisible, holds its space so nothing around it shifts while it types.
    <View>
      <Text style={[style, { opacity: 0 }]} numberOfLines={numberOfLines}>{text}</Text>
      <View style={{ position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'center' }}>
        <Text style={style} numberOfLines={numberOfLines}>{text.slice(0, n)}</Text>
        {showCursor && (
          <Animated.View style={{ width: Math.max(4, size * 0.45), height: size * 0.9, marginLeft: 2, backgroundColor: cursor, opacity: blink }} />
        )}
      </View>
    </View>
  );
}
