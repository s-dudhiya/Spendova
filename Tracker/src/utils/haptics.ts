export const triggerHaptic = (duration = 50) => {
  if (typeof window !== "undefined" && navigator && navigator.vibrate) {
    try {
      navigator.vibrate(duration);
    } catch (e) {
      // Ignore errors if vibration is disabled or not supported
    }
  }
};
