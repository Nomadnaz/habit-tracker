import { useRef } from 'react';
import { Animated } from 'react-native';

export function useTaskDragFloat() {
  const floatTop = useRef(new Animated.Value(0)).current;
  const floatLeft = useRef(new Animated.Value(0)).current;
  const grabOffsetYRef = useRef(0);
  const overlayOriginYRef = useRef(0);
  const overlayOriginXRef = useRef(0);
  const lastFingerYRef = useRef(0);
  const lastColLeftRef = useRef(0);

  function setOverlayOrigin(x: number, y: number) {
    overlayOriginXRef.current = x;
    overlayOriginYRef.current = y;
    if (lastFingerYRef.current > 0) {
      floatTop.setValue(chipTopFromFinger(lastFingerYRef.current));
      floatLeft.setValue(chipLeftFromColumn(lastColLeftRef.current));
    }
  }

  function chipTopFromFinger(fingerPageY: number) {
    return fingerPageY - grabOffsetYRef.current - overlayOriginYRef.current;
  }

  function chipLeftFromColumn(colLeft: number) {
    return colLeft - overlayOriginXRef.current;
  }

  function startFloat(rowWinY: number, colLeft: number, fingerPageY: number) {
    grabOffsetYRef.current = fingerPageY - rowWinY;
    lastFingerYRef.current = fingerPageY;
    lastColLeftRef.current = colLeft;
    floatTop.setValue(chipTopFromFinger(fingerPageY));
    floatLeft.setValue(chipLeftFromColumn(colLeft));
  }

  /** Track finger in window space — stable for long drags and list auto-scroll. */
  function moveFloat(fingerPageY: number) {
    lastFingerYRef.current = fingerPageY;
    floatTop.setValue(chipTopFromFinger(fingerPageY));
  }

  function syncColumnLeft(colLeft: number) {
    lastColLeftRef.current = colLeft;
    floatLeft.setValue(chipLeftFromColumn(colLeft));
  }

  return { floatTop, floatLeft, startFloat, moveFloat, syncColumnLeft, setOverlayOrigin };
}
