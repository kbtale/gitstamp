import { createUndoStack } from '@ui-sdk/core';
import { ContributionLevel } from '../types';

export type MatrixListener = (matrix: ContributionLevel[][]) => void;

interface MatrixSnapshot {
  matrix: ContributionLevel[][];
  label?: string;
}

export class MatrixStore {
  private matrix: ContributionLevel[][];
  private width: number;
  private label?: string;
  private readonly height: number = 7;
  private undoStack: ReturnType<typeof createUndoStack<MatrixSnapshot>>;
  private listeners: Set<MatrixListener> = new Set();
  private isPointerDown: boolean = false;
  private activeBrush: ContributionLevel = 4;
  private currentStrokeBrush: ContributionLevel = 4;

  constructor(
    initialWidth: number = 24,
    initialMatrix?: ContributionLevel[][],
    initialLabel?: string
  ) {
    if (initialMatrix && initialMatrix.length === 7 && initialMatrix[0]?.length) {
      this.width = Math.max(1, Math.min(53, initialMatrix[0].length));
      this.matrix = initialMatrix.map((row) => [...row]);
    } else {
      this.width = Math.max(1, Math.min(53, initialWidth));
      this.matrix = this.createEmptyMatrix(this.width);
    }
    this.label = initialLabel;
    this.undoStack = createUndoStack(this.snapshot());
  }

  private snapshot(): MatrixSnapshot {
    return {
      matrix: this.getMatrix(),
      label: this.label
    };
  }

  private createEmptyMatrix(width: number): ContributionLevel[][] {
    return Array.from({ length: 7 }, () =>
      new Array<ContributionLevel>(width).fill(0)
    );
  }

  public getMatrix(): ContributionLevel[][] {
    return this.matrix.map((row) => [...row]);
  }

  public getWidth(): number {
    return this.width;
  }

  public getHeight(): number {
    return this.height;
  }

  public getLabel(): string | undefined {
    return this.label;
  }

  public getActiveBrush(): ContributionLevel {
    return this.activeBrush;
  }

  public setActiveBrush(level: ContributionLevel): void {
    this.activeBrush = level;
  }

  public reset(newMatrix: ContributionLevel[][], label?: string): void {
    const newWidth = Math.max(1, Math.min(53, newMatrix[0]?.length || 24));
    this.width = newWidth;
    this.matrix = newMatrix.map((row) => [...row]);
    this.label = label;
    this.undoStack = createUndoStack(this.snapshot());
    this.notify();
  }

  public setMatrix(newMatrix: ContributionLevel[][], label?: string): void {
    const newWidth = Math.max(1, Math.min(53, newMatrix[0]?.length || 24));
    this.width = newWidth;
    this.matrix = newMatrix.map((row) => [...row]);
    if (label !== undefined) {
      this.label = label;
    }
    this.undoStack.record(this.snapshot());
    this.notify();
  }

  public setCell(row: number, col: number, level: ContributionLevel): void {
    if (row < 0 || row >= 7 || col < 0 || col >= this.width) {
      return;
    }
    if (this.matrix[row][col] === level) {
      return;
    }
    this.matrix[row][col] = level;
    this.notify();
  }

  public commitPaint(): void {
    this.undoStack.record(this.snapshot());
  }

  public setWidth(newWidth: number): void {
    const clamped = Math.max(1, Math.min(53, newWidth));
    if (clamped === this.width) {
      return;
    }

    const oldMatrix = this.matrix;
    const newMatrix = this.createEmptyMatrix(clamped);

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < clamped; c++) {
        if (c < this.width) {
          newMatrix[r][c] = oldMatrix[r][c];
        }
      }
    }

    this.width = clamped;
    this.matrix = newMatrix;
    this.undoStack.record(this.snapshot());
    this.notify();
  }

  public clear(): void {
    this.matrix = this.createEmptyMatrix(this.width);
    this.undoStack.record(this.snapshot());
    this.notify();
  }

  public invert(): void {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < this.width; c++) {
        const current = this.matrix[r][c];
        this.matrix[r][c] = ((4 - current) as ContributionLevel);
      }
    }
    this.undoStack.record(this.snapshot());
    this.notify();
  }

  public nudge(dx: number, dy: number): void {
    const next = this.createEmptyMatrix(this.width);
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < this.width; c++) {
        const nr = r + dy;
        const nc = c + dx;
        if (nr >= 0 && nr < 7 && nc >= 0 && nc < this.width) {
          next[nr][nc] = this.matrix[r][c];
        }
      }
    }
    this.matrix = next;
    this.undoStack.record(this.snapshot());
    this.notify();
  }

  public flipHorizontal(): void {
    this.matrix = this.matrix.map((row) => [...row].reverse());
    this.undoStack.record(this.snapshot());
    this.notify();
  }

  public flipVertical(): void {
    this.matrix = [...this.matrix].reverse().map((row) => [...row]);
    this.undoStack.record(this.snapshot());
    this.notify();
  }

  public subscribe(listener: MatrixListener): () => void {
    this.listeners.add(listener);
    listener(this.getMatrix());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const copy = this.getMatrix();
    this.listeners.forEach((fn) => fn(copy));
  }

  public canUndo(): boolean {
    return this.undoStack.canUndo();
  }

  public canRedo(): boolean {
    return this.undoStack.canRedo();
  }

  public undo(): void {
    if (!this.canUndo()) {
      return;
    }
    const state = this.undoStack.undo();
    if (state && Array.isArray(state.matrix)) {
      this.width = state.matrix[0].length;
      this.matrix = state.matrix.map((r) => [...r]);
      this.label = state.label;
      this.notify();
    }
  }

  public redo(): void {
    if (!this.canRedo()) {
      return;
    }
    const state = this.undoStack.redo();
    if (state && Array.isArray(state.matrix)) {
      this.width = state.matrix[0].length;
      this.matrix = state.matrix.map((r) => [...r]);
      this.label = state.label;
      this.notify();
    }
  }

  public handlePointerDown(row: number, col: number): void {
    if (row < 0 || row >= 7 || col < 0 || col >= this.width) {
      return;
    }
    this.isPointerDown = true;
    const current = this.matrix[row][col];
    if (this.activeBrush === 0) {
      this.currentStrokeBrush = 0;
    } else if (current === this.activeBrush) {
      this.currentStrokeBrush = 0;
    } else {
      this.currentStrokeBrush = this.activeBrush;
    }
    this.setCell(row, col, this.currentStrokeBrush);
  }

  public handlePointerEnter(row: number, col: number): void {
    if (this.isPointerDown) {
      this.setCell(row, col, this.currentStrokeBrush);
    }
  }

  public handlePointerUp(): void {
    if (this.isPointerDown) {
      this.isPointerDown = false;
      this.commitPaint();
    }
  }
}
