// Tiny event bus so any component can show a toast: toast('Saved', 'ok' | 'error' | 'info')
export const toast = (message, kind = 'info') =>
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, kind } }));
