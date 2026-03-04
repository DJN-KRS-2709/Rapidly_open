/**
 * Polyfills for browser globals that may be missing in certain environments
 */

// Fix for react-markdown and other packages that reference 'boolean' as a global
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).boolean === 'undefined') {
  (globalThis as any).boolean = Boolean;
}

// Fix for react-markdown and other packages that reference 'char' as a global
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).char === 'undefined') {
  (globalThis as any).char = String;
}
