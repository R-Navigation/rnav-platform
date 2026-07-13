export function getTrappedFocusIndex(currentIndex: number, count: number, shiftKey: boolean) {
  if (count < 1) return null;
  if (shiftKey && currentIndex === 0) return count - 1;
  if (!shiftKey && currentIndex === count - 1) return 0;
  return null;
}
