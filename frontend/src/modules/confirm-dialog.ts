export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.setAttribute('role', 'presentation');

    const dialog = document.createElement('div');
    dialog.className = 'dialog-panel';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleId = `dialog-title-${Date.now()}`;
    const descId = `dialog-desc-${Date.now()}`;
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.setAttribute('aria-describedby', descId);

    const heading = document.createElement('h2');
    heading.id = titleId;
    heading.className = 'dialog-title';
    heading.textContent = options.title;

    const body = document.createElement('p');
    body.id = descId;
    body.className = 'dialog-body';
    body.textContent = options.message;

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = options.cancelLabel || 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = options.danger ? 'btn btn-danger' : 'btn btn-primary';
    confirmBtn.textContent = options.confirmLabel;

    let settled = false;
    const finish = (accepted: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      backdrop.classList.add('dialog-leaving');
      window.setTimeout(() => {
        backdrop.remove();
        previouslyFocused?.focus();
      }, 160);
      resolve(accepted);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    };

    cancelBtn.addEventListener('click', () => finish(false));
    confirmBtn.addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        finish(false);
      }
    });
    document.addEventListener('keydown', onKeyDown);

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(heading);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    confirmBtn.focus();
  });
}
