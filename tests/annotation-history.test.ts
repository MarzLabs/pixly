import { describe, expect, it } from 'vitest';
import type { Annotation } from '@content/tools/capture-annotate/annotation-tools/annotation-tool';
import {
  AnnotationHistory,
  MAX_HISTORY_STEPS,
} from '@content/tools/capture-annotate/annotation-history';

function buildAnnotation(x: number, text?: string): Annotation {
  const annotation: Annotation = {
    toolId: 'arrow',
    start: { x, y: 10 },
    end: { x: x + 50, y: 40 },
    style: { color: '#EF4444', strokeWidthPx: 4 },
  };

  if (text !== undefined) {
    annotation.text = text;
  }

  return annotation;
}

describe('AnnotationHistory', () => {
  it('undoes insertions one at a time', () => {
    const history = new AnnotationHistory();
    history.push(buildAnnotation(0));
    history.push(buildAnnotation(100));

    expect(history.undo()).toBe(true);
    expect(history.list()).toHaveLength(1);
    expect(history.at(0)?.start.x).toBe(0);

    expect(history.undo()).toBe(true);
    expect(history.list()).toHaveLength(0);
  });

  it('returns false when there is nothing to undo', () => {
    const history = new AnnotationHistory();

    expect(history.canUndo).toBe(false);
    expect(history.undo()).toBe(false);
  });

  it('collapses a whole move/resize drag into a single undo step', () => {
    const history = new AnnotationHistory();
    history.push(buildAnnotation(0));

    history.beginGesture();

    // Many pointermove frames on the same drag…
    for (const x of [10, 20, 30, 40]) {
      history.updateDuringGesture(0, buildAnnotation(x));
    }

    history.endGesture();
    expect(history.at(0)?.start.x).toBe(40);

    // …revert with ONE undo, straight back to the pre-drag position.
    expect(history.undo()).toBe(true);
    expect(history.at(0)?.start.x).toBe(0);
    // And the next undo removes the insertion itself.
    expect(history.undo()).toBe(true);
    expect(history.list()).toHaveLength(0);
  });

  it('leaves no step for a gesture that changed nothing (a plain grab-click)', () => {
    const history = new AnnotationHistory();
    history.push(buildAnnotation(0));

    history.beginGesture();
    history.endGesture();

    // The single undo available is still the insertion.
    expect(history.undo()).toBe(true);
    expect(history.list()).toHaveLength(0);
    expect(history.canUndo).toBe(false);
  });

  it('makes a restyle (update) a single undoable step', () => {
    const history = new AnnotationHistory();
    history.push(buildAnnotation(0));

    const restyled = { ...buildAnnotation(0), style: { color: '#3B82F6', strokeWidthPx: 7 } };
    history.update(0, restyled);
    expect(history.at(0)?.style.color).toBe('#3B82F6');

    expect(history.undo()).toBe(true);
    expect(history.at(0)?.style.color).toBe('#EF4444');
  });

  it('ignores updates on out-of-range indices without leaving a step', () => {
    const history = new AnnotationHistory();
    history.push(buildAnnotation(0));

    history.update(5, buildAnnotation(999));
    expect(history.at(0)?.start.x).toBe(0);

    expect(history.undo()).toBe(true);
    expect(history.list()).toHaveLength(0);
  });

  it('makes removing one annotation a single undoable step', () => {
    const history = new AnnotationHistory();
    history.push(buildAnnotation(0, 'a'));
    history.push(buildAnnotation(100, 'b'));

    history.remove(0);
    expect(history.list()).toHaveLength(1);
    expect(history.at(0)?.text).toBe('b');

    expect(history.undo()).toBe(true);
    expect(history.list()).toHaveLength(2);
    expect(history.at(0)?.text).toBe('a');
  });

  it('ignores removals on out-of-range indices without leaving a step', () => {
    const history = new AnnotationHistory();
    history.push(buildAnnotation(0));

    history.remove(-1);
    history.remove(3);
    expect(history.list()).toHaveLength(1);

    expect(history.undo()).toBe(true);
    expect(history.canUndo).toBe(false);
  });

  it('makes clear undoable, restoring every annotation', () => {
    const history = new AnnotationHistory();
    history.push(buildAnnotation(0, 'a'));
    history.push(buildAnnotation(100, 'b'));

    history.clear();
    expect(history.list()).toHaveLength(0);

    expect(history.undo()).toBe(true);
    expect(history.list()).toHaveLength(2);
    expect(history.at(1)?.text).toBe('b');
  });

  it('clearing an empty list leaves no bogus undo step', () => {
    const history = new AnnotationHistory();

    history.clear();
    expect(history.canUndo).toBe(false);
  });

  it('ignores gesture updates on out-of-range indices', () => {
    const history = new AnnotationHistory();
    history.push(buildAnnotation(0));

    history.beginGesture();
    history.updateDuringGesture(5, buildAnnotation(999));
    history.endGesture();

    expect(history.at(0)?.start.x).toBe(0);
    // Nothing changed, so the gesture left no step either.
    expect(history.undo()).toBe(true);
    expect(history.list()).toHaveLength(0);
  });

  it('caps the history, dropping the oldest steps first', () => {
    const history = new AnnotationHistory();

    for (let index = 0; index < MAX_HISTORY_STEPS + 10; index += 1) {
      history.push(buildAnnotation(index));
    }

    let undos = 0;

    while (history.undo()) {
      undos += 1;
    }

    expect(undos).toBe(MAX_HISTORY_STEPS);
    // The oldest 10 insertions fell off the history, so they can no longer be undone.
    expect(history.list()).toHaveLength(10);
  });
});
