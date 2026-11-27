import { describe, expect, it } from 'vitest';
import { MatrixStore } from '../matrix-state';

describe('MatrixStore', () => {
  it('clamps initial width and resize bounds between 1 and 53', () => {
    const tooSmall = new MatrixStore(0);
    expect(tooSmall.getWidth()).toBe(1);

    const tooLarge = new MatrixStore(99);
    expect(tooLarge.getWidth()).toBe(53);

    tooLarge.setWidth(10);
    expect(tooLarge.getWidth()).toBe(10);
    expect(tooLarge.getMatrix()[0].length).toBe(10);
  });

  it('records paint strokes and supports undo/redo', () => {
    const store = new MatrixStore(8);
    store.setActiveBrush(4);
    store.handlePointerDown(0, 0);
    store.handlePointerEnter(0, 1);
    store.handlePointerUp();

    expect(store.getMatrix()[0][0]).toBe(4);
    expect(store.getMatrix()[0][1]).toBe(4);
    expect(store.canUndo()).toBe(true);

    store.undo();
    expect(store.getMatrix()[0][0]).toBe(0);
    expect(store.canRedo()).toBe(true);

    store.redo();
    expect(store.getMatrix()[0][1]).toBe(4);
  });

  it('inverts and clears cells cleanly', () => {
    const store = new MatrixStore(4);
    store.setCell(0, 0, 4);
    store.setCell(0, 1, 1);
    store.invert();

    expect(store.getMatrix()[0][0]).toBe(0);
    expect(store.getMatrix()[0][1]).toBe(3);
    expect(store.getMatrix()[0][2]).toBe(4);

    store.clear();
    expect(store.getMatrix().flat().every((v) => v === 0)).toBe(true);
  });

  it('supports directional nudge and horizontal/vertical mirror flips with undo', () => {
    const store = new MatrixStore(4);
    store.setCell(0, 0, 4);
    store.commitPaint();

    store.nudge(1, 2);
    expect(store.getMatrix()[2][1]).toBe(4);
    expect(store.getMatrix()[0][0]).toBe(0);

    store.flipHorizontal();
    expect(store.getMatrix()[2][2]).toBe(4);

    store.flipVertical();
    expect(store.getMatrix()[4][2]).toBe(4);

    store.undo();
    expect(store.getMatrix()[2][2]).toBe(4);
  });
});
