import { definePrimitive } from '@ui-sdk/core';
import { ContributionLevel } from '../types';

export const segmentedControlPrimitive = definePrimitive({
  name: 'segmented-control',
  options: {
    initialValue: 'string'
  },
  state: (options: { initialValue?: string }) => ({
    value: options.initialValue || ''
  }),
  api: (context) => ({
    setValue: (val: string) => context.store.set({ value: val }),
    getValue: () => context.store.get().value
  }),
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: 'radiogroup' })
    }),
    item: slot({
      attrs: (state: any, props: any) => ({
        role: 'radio',
        'aria-checked': String(state.value === props?.value)
      })
    })
  })
});

export const sliderPrimitive = definePrimitive({
  name: 'slider-control',
  options: {
    initialValue: 'number',
    min: 'number',
    max: 'number'
  },
  state: (options: { initialValue?: number; min?: number; max?: number }) => ({
    value: options.initialValue !== undefined ? options.initialValue : 128,
    min: options.min !== undefined ? options.min : 0,
    max: options.max !== undefined ? options.max : 255
  }),
  api: (context) => ({
    setValue: (val: number) => context.store.set({ value: val }),
    getValue: () => context.store.get().value
  }),
  slots: (slot) => ({
    root: slot({
      attrs: (state: any) => ({
        role: 'slider',
        'aria-valuenow': state.value,
        'aria-valuemin': state.min,
        'aria-valuemax': state.max
      })
    })
  })
});

export const toggleSwitchPrimitive = definePrimitive({
  name: 'toggle-switch',
  options: {
    initialChecked: 'boolean'
  },
  state: (options: { initialChecked?: boolean }) => ({
    checked: Boolean(options.initialChecked)
  }),
  api: (context) => ({
    setChecked: (checked: boolean) => context.store.set({ checked }),
    isChecked: () => context.store.get().checked,
    toggle: () => context.store.set({ checked: !context.store.get().checked })
  }),
  slots: (slot) => ({
    root: slot({
      attrs: (state: any) => ({
        role: 'switch',
        'aria-checked': String(state.checked)
      })
    })
  })
});

export const brushPalettePrimitive = definePrimitive({
  name: 'brush-palette',
  options: {
    initialBrush: 'number'
  },
  state: (options: { initialBrush?: ContributionLevel }) => ({
    brush: (options.initialBrush !== undefined ? options.initialBrush : 4) as ContributionLevel
  }),
  api: (context) => ({
    setBrush: (brush: ContributionLevel) => context.store.set({ brush }),
    getBrush: () => context.store.get().brush as ContributionLevel
  }),
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: 'radiogroup', 'aria-label': 'Brush level selector' })
    })
  })
});

export interface SegmentedControlProps<T extends string> {
  container: HTMLElement;
  options: { label: string; value: T }[];
  initialValue: T;
  onChange: (value: T) => void;
}

export function createSegmentedControl<T extends string>({
  container,
  options,
  initialValue,
  onChange
}: SegmentedControlProps<T>) {
  const primitiveInstance = segmentedControlPrimitive({
    id: 'seg-' + Math.random().toString(36).substring(2, 7),
    initialValue
  });
  const api = primitiveInstance.api as {
    setValue: (val: string) => void;
    getValue: () => string;
  };

  container.innerHTML = '';
  container.className = 'segmented-control';
  container.setAttribute('role', 'radiogroup');

  const buttons: { btn: HTMLButtonElement; val: T }[] = [];

  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `segmented-button ${opt.value === initialValue ? 'active' : ''}`;
    btn.textContent = opt.label;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(opt.value === initialValue));

    btn.addEventListener('click', () => {
      api.setValue(opt.value);
      onChange(opt.value);
    });

    buttons.push({ btn, val: opt.value });
    container.appendChild(btn);
  });

  primitiveInstance.subscribe(() => {
    const state = primitiveInstance.get() as { value: string };
    buttons.forEach(({ btn, val }) => {
      const active = val === state.value;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
    });
  });

  return {
    setValue(val: T) {
      api.setValue(val);
      const state = primitiveInstance.get() as { value: string };
      buttons.forEach(({ btn, val: itemVal }) => {
        const active = itemVal === state.value;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-checked', String(active));
      });
    },
    getValue() {
      return api.getValue() as T;
    }
  };
}

export interface SliderProps {
  container: HTMLElement;
  min: number;
  max: number;
  initialValue: number;
  label: string;
  onChange: (value: number) => void;
}

export function createSlider({
  container,
  min,
  max,
  initialValue,
  label,
  onChange
}: SliderProps) {
  const primitiveInstance = sliderPrimitive({
    id: 'slider-' + Math.random().toString(36).substring(2, 7),
    initialValue,
    min,
    max
  });
  const api = primitiveInstance.api as {
    setValue: (val: number) => void;
    getValue: () => number;
  };

  const inputId = 'slider-input-' + Math.random().toString(36).substring(2, 7);
  const initialPercent = Math.max(0, Math.min(100, Math.round(((initialValue - min) / (max - min)) * 100)));

  container.innerHTML = `
    <label class="control-label" for="${inputId}">
      <span>${label}</span>
      <span class="slider-display">${initialValue}</span>
    </label>
    <input type="range" id="${inputId}" class="range-slider" min="${min}" max="${max}" value="${initialValue}" style="--slider-fill: ${initialPercent}%;" />
  `;

  const input = container.querySelector('input') as HTMLInputElement;
  const display = container.querySelector('.slider-display') as HTMLElement;

  function updateVisualFill(val: number) {
    const percent = Math.max(0, Math.min(100, Math.round(((val - min) / (max - min)) * 100)));
    input.style.setProperty('--slider-fill', `${percent}%`);
  }

  input.addEventListener('input', () => {
    const val = Number(input.value);
    api.setValue(val);
    display.textContent = String(val);
    updateVisualFill(val);
    onChange(val);
  });

  primitiveInstance.subscribe(() => {
    const state = primitiveInstance.get() as { value: number };
    input.value = String(state.value);
    display.textContent = String(state.value);
    updateVisualFill(state.value);
  });

  return {
    setValue(val: number) {
      api.setValue(val);
      input.value = String(val);
      display.textContent = String(val);
      updateVisualFill(val);
    },
    getValue() {
      return api.getValue();
    },
    setEnabled(enabled: boolean) {
      input.disabled = !enabled;
      container.style.opacity = enabled ? '1' : '0.4';
    }
  };
}

export interface ToggleSwitchProps {
  container: HTMLElement;
  label: string;
  initialChecked: boolean;
  onChange: (checked: boolean) => void;
}

export function createToggleSwitch({
  container,
  label,
  initialChecked,
  onChange
}: ToggleSwitchProps) {
  const primitiveInstance = toggleSwitchPrimitive({
    id: 'toggle-' + Math.random().toString(36).substring(2, 7),
    initialChecked
  });
  const api = primitiveInstance.api as {
    setChecked: (checked: boolean) => void;
    isChecked: () => boolean;
  };

  const toggleId = 'toggle-input-' + Math.random().toString(36).substring(2, 7);
  container.innerHTML = `
    <div class="toggle-switch-wrapper">
      <label class="control-label" for="${toggleId}">${label}</label>
      <label class="toggle-switch" for="${toggleId}">
        <input type="checkbox" id="${toggleId}" ${initialChecked ? 'checked' : ''} />
        <span class="slider-knob"></span>
      </label>
    </div>
  `;

  const input = container.querySelector('input') as HTMLInputElement;

  input.addEventListener('change', () => {
    api.setChecked(input.checked);
    onChange(input.checked);
  });

  primitiveInstance.subscribe(() => {
    const state = primitiveInstance.get() as { checked: boolean };
    input.checked = state.checked;
  });

  return {
    setChecked(checked: boolean) {
      api.setChecked(checked);
      input.checked = checked;
    },
    isChecked() {
      return api.isChecked();
    }
  };
}

export interface BrushPaletteProps {
  container: HTMLElement;
  initialBrush: ContributionLevel;
  onChange: (level: ContributionLevel) => void;
}

export function createBrushPalette({
  container,
  initialBrush,
  onChange
}: BrushPaletteProps) {
  const primitiveInstance = brushPalettePrimitive({
    id: 'brush-' + Math.random().toString(36).substring(2, 7),
    initialBrush
  });
  const api = primitiveInstance.api as {
    setBrush: (brush: ContributionLevel) => void;
    getBrush: () => ContributionLevel;
  };

  container.className = 'brush-palette';
  container.innerHTML = `<span class="brush-palette-label">Brush:</span>`;

  const levels: ContributionLevel[] = [0, 1, 2, 3, 4];
  const chips: { el: HTMLElement; level: ContributionLevel }[] = [];

  levels.forEach((lvl) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `brush-chip brush-${lvl} ${lvl === initialBrush ? 'active' : ''}`;
    chip.textContent = lvl === 0 ? '✕' : String(lvl);
    chip.title = lvl === 0 ? 'Erase (Level 0)' : `Level ${lvl}`;

    chip.addEventListener('click', () => {
      api.setBrush(lvl);
      onChange(lvl);
    });

    chips.push({ el: chip, level: lvl });
    container.appendChild(chip);
  });

  primitiveInstance.subscribe(() => {
    const state = primitiveInstance.get() as { brush: ContributionLevel };
    chips.forEach(({ el, level }) => {
      el.classList.toggle('active', level === state.brush);
    });
  });

  return {
    setBrush(level: ContributionLevel) {
      api.setBrush(level);
      chips.forEach(({ el, level: chipLvl }) => {
        el.classList.toggle('active', chipLvl === level);
      });
    },
    getBrush() {
      return api.getBrush();
    }
  };
}
