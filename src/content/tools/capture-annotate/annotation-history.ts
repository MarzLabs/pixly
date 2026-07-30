import type { Annotation } from './annotation-tools/annotation-tool';

/**
 * Undo history for the capture editor's annotations. Snapshot-based: every undoable step stores
 * the annotation list as it was before the change, so undo restores inserts, moves, resizes and
 * clears alike — not just the last insertion. Continuous gestures (a move/resize drag) collapse
 * into ONE step via beginGesture/endGesture: the pre-drag state is checkpointed once, per-frame
 * updates replace the live list without new steps, and a gesture that changed nothing leaves no
 * step at all. Annotations are treated as immutable (the editor replaces, never mutates them),
 * so shallow array snapshots are enough. Pure data structure, no DOM — unit-testable.
 */

/** Bounded history so a marathon session cannot grow memory without limit (oldest step drops). */
export const MAX_HISTORY_STEPS = 100;

export class AnnotationHistory {
  private current: Annotation[] = [];
  private past: Annotation[][] = [];
  /** Pre-gesture snapshot awaiting the first real change; null while no gesture is open. */
  private pendingGesture: Annotation[] | null = null;
  private gestureChanged = false;

  /** Live annotation list, in paint order. */
  list(): readonly Annotation[] {
    return this.current;
  }

  at(index: number): Annotation | undefined {
    return this.current[index];
  }

  get count(): number {
    return this.current.length;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  /** Appends an annotation as one undoable step. */
  push(annotation: Annotation): void {
    this.checkpoint();
    this.current.push(annotation);
  }

  /** Replaces one annotation as a single undoable step (e.g. restyling a selection). */
  update(index: number, annotation: Annotation): void {
    if (index < 0 || index >= this.current.length) {
      return;
    }

    this.checkpoint();
    this.current[index] = annotation;
  }

  /** Removes one annotation as a single undoable step (e.g. deleting a selection). */
  remove(index: number): void {
    if (index < 0 || index >= this.current.length) {
      return;
    }

    this.checkpoint();
    this.current.splice(index, 1);
  }

  /** Empties the list as one undoable step; a no-op when already empty. */
  clear(): void {
    if (this.current.length === 0) {
      return;
    }

    this.checkpoint();
    this.current = [];
  }

  /** Opens a gesture: the state as of now becomes the undo point if any update follows. */
  beginGesture(): void {
    this.pendingGesture = [...this.current];
    this.gestureChanged = false;
  }

  /** Replaces one annotation inside the open gesture; drag frames never add history steps. */
  updateDuringGesture(index: number, annotation: Annotation): void {
    if (index < 0 || index >= this.current.length) {
      return;
    }

    this.current[index] = annotation;
    this.gestureChanged = true;
  }

  /** Closes the gesture; only gestures that actually changed something leave a step. */
  endGesture(): void {
    if (this.pendingGesture && this.gestureChanged) {
      this.pushPast(this.pendingGesture);
    }

    this.pendingGesture = null;
    this.gestureChanged = false;
  }

  /** Restores the previous step. Returns false when there is nothing to undo. */
  undo(): boolean {
    const previous = this.past.pop();

    if (!previous) {
      return false;
    }

    this.current = previous;

    return true;
  }

  private checkpoint(): void {
    this.pushPast([...this.current]);
  }

  private pushPast(snapshot: Annotation[]): void {
    this.past.push(snapshot);

    if (this.past.length > MAX_HISTORY_STEPS) {
      this.past.shift();
    }
  }
}
