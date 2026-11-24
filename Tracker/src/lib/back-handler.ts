/**
 * Spendova Centralized Back Navigation System
 * Handles Android system back swipe / hardware back button via MainActivity bridge,
 * as well as in-app navigation hierarchy.
 */

export type BackHandlerCallback = () => boolean;

const handlerStack: BackHandlerCallback[] = [];

/**
 * Register a back handler. Handlers are evaluated in LIFO (stack) order:
 * the most recently registered handler gets priority.
 * Return true if your handler handled the back action, or false to delegate.
 */
export const registerBackHandler = (handler: BackHandlerCallback): (() => void) => {
  handlerStack.push(handler);
  return () => {
    const index = handlerStack.lastIndexOf(handler);
    if (index !== -1) {
      handlerStack.splice(index, 1);
    }
  };
};

/**
 * Executes the back action:
 * 1. Executes top-of-stack registered handlers.
 * 2. If no handler handled it, checks for any open Radix Dialogs, Vaul Drawers, or Menus in the DOM
 *    and dispatches an Escape key event to close them.
 * 3. Returns true if back was handled, or false if at root level.
 */
export const triggerAppBack = (): boolean => {
  for (let i = handlerStack.length - 1; i >= 0; i--) {
    try {
      const handled = handlerStack[i]();
      if (handled) return true;
    } catch (err) {
      console.warn("Back handler execution error:", err);
    }
  }

  // Fallback: Check if any open dialog/drawer/sheet/menu exists in DOM
  const openOverlay = document.querySelector(
    '[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"]), [vaul-drawer]:not([data-state="closed"]), [role="menu"]'
  );
  if (openOverlay) {
    const escEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escEvent);
    return true;
  }

  return false;
};

// Expose on global window object for Android WebView evaluateJavascript
if (typeof window !== "undefined") {
  (window as unknown as { handleAppBack?: () => boolean }).handleAppBack = triggerAppBack;
}
