export type ToastVariant = 'info' | 'success' | 'error';

let containerEl: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (containerEl && document.body.contains(containerEl)) {
    return containerEl;
  }
  const el = document.createElement('div');
  el.className = 'toast-stack';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  document.body.appendChild(el);
  containerEl = el;
  return el;
}

export function showToast(
  message: string,
  variant: ToastVariant = 'info',
  durationMs: number = 4200
): void {
  const stack = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast-item toast-${variant}`;

  const dot = document.createElement('span');
  dot.className = 'toast-dot';
  dot.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.textContent = '×';

  let closed = false;
  const dismiss = () => {
    if (closed) {
      return;
    }
    closed = true;
    toast.classList.add('toast-leaving');
    window.setTimeout(() => {
      toast.remove();
    }, 180);
  };

  closeBtn.addEventListener('click', dismiss);

  toast.appendChild(dot);
  toast.appendChild(text);
  toast.appendChild(closeBtn);
  stack.appendChild(toast);

  window.setTimeout(dismiss, durationMs);
}
