// How text breaks across lines, the native stand-ins for CSS text-wrap.
// BALANCE for headings and short centred lines: Android evens the line
// lengths ('balanced'); iOS has no balancing, so it at least keeps a lone
// word off the last line ('push-out'). PRETTY for paragraphs: iOS keeps a
// lone word off the last line; Android's default breaker ('highQuality') is
// already an optimal-fit one, so it's left alone. Spread onto a <Text>.
// Not for TypeLine: re-breaking while it types would shuffle words about.
import { Platform, type TextProps } from 'react-native';

export const BALANCE: TextProps = Platform.select<TextProps>({
  android: { textBreakStrategy: 'balanced' },
  ios: { lineBreakStrategyIOS: 'push-out' },
  default: {},
});

export const PRETTY: TextProps = Platform.select<TextProps>({
  ios: { lineBreakStrategyIOS: 'push-out' },
  default: {},
});
