import { createUndoStack } from '@ui-sdk/core';
import { ContributionLevel } from '../types';

export type MatrixListener = (matrix: ContributionLevel[][]) => void;

export class MatrixStore {
  private matrix: ContributionLevel[][];
  private width: number;
  private readonly height: number = 7;
  private undoStack: ReturnType<typeof createUndoStack<ContributionLevel[][]>>;
  private listeners: Set<MatrixListener> = new Set();
  private isPointerDown: boolean = false;
  private activeBrush: ContributionLevel = 4;

  constructor(initialWidth: number = 24) {
    this.width = Math.max(1, Math.min(44, initialWidth));
    this.matrix = this.createEmptyMatrix(this.width);
    this.undoStack = createUndoStack(this.getMatrix());
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

  public getActiveBrush(): ContributionLevel {
    return this.activeBrush;
  }

  public setActiveBrush(level: ContributionLevel): void {
    this.activeBrush = level;
  }

  public setMatrix(newMatrix: ContributionLevel[][]): void {
    const newWidth = Math.max(1, Math.min(44, newMatrix[0]?.length || 24));
    this.width = newWidth;
    this.matrix = newMatrix.map((row) => [...row]);
    this.undoStack.record(this.getMatrix());
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
    this.undoStack.record(this.getMatrix());
  }

  public setWidth(newWidth: number): void {
    const clamped = Math.max(1, Math.min(44, newWidth));
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
    this.undoStack.record(this.getMatrix());
    this.notify();
  }

  public clear(): void {
    this.matrix = this.createEmptyMatrix(this.width);
    this.undoStack.record(this.getMatrix());
    this.notify();
  }

  public invert(): void {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < this.width; c++) {
        const current = this.matrix[r][c];
        this.matrix[r][c] = ((4 - current) as ContributionLevel);
      }
    }
    this.undoStack.record(this.getMatrix());
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
    if (state && Array.isArray(state)) {
      this.width = state[0].length;
      this.matrix = state.map((r) => [...r]);
      this.notify();
    }
  }

  public redo(): void {
    if (!this.canRedo()) {
      return;
    }
    const state = this.undoStack.redo();
    if (state && Array.isArray(state)) {
      this.width = state[0].length;
      this.matrix = state.map((r) => [...r]);
      this.notify();
    }
  }

  public handlePointerDown(row: number, col: number): void {
    this.isPointerDown = true;
    this.setCell(row, col, this.activeBrush);
  }

  public handlePointerEnter(row: number, col: number): void {
    if (this.isPointerDown) {
      this.setCell(row, col, this.activeBrush);
    }
  }

  public handlePointerUp(): void {
    if (this.isPointerDown) {
      this.isPointerDown = false;
      this.commitPaint();
    }
  }
}
