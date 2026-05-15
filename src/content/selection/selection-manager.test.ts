import { beforeEach, describe, expect, it } from 'vitest';
import { SelectionManager } from './selection-manager';

function makeElement(width: number, height: number, left: number, top: number): HTMLElement {
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({
        width,
        height,
        left,
        top,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
    });

    return element;
}

describe('SelectionManager', () => {
    let manager: SelectionManager;

    beforeEach(() => {
        manager = new SelectionManager();
        manager.setMaxItems(3);
    });

    it('adds an element and returns "added"', () => {
        // Arrange
        const element = makeElement(10, 10, 0, 0);
        document.body.appendChild(element);

        // Act
        const result = manager.toggle(element);

        // Assert
        expect(result).toBe('added');
        expect(manager.listElements()).toEqual([element]);
    });

    it('removes the same element on a second toggle', () => {
        // Arrange
        const element = makeElement(10, 10, 0, 0);
        document.body.appendChild(element);
        manager.toggle(element);

        // Act
        const result = manager.toggle(element);

        // Assert
        expect(result).toBe('removed');
        expect(manager.isEmpty()).toBe(true);
    });

    it('rejects further additions once the max is reached', () => {
        // Arrange
        for (let index = 0; index < 3; index += 1) {
            const element = makeElement(10, 10, 0, 0);
            document.body.appendChild(element);
            manager.toggle(element);
        }

        // Act
        const extra = makeElement(10, 10, 0, 0);
        document.body.appendChild(extra);
        const result = manager.toggle(extra);

        // Assert
        expect(result).toBe('limit-reached');
        expect(manager.listElements()).toHaveLength(3);
    });

    it('computes a bounding box that covers every selected element', () => {
        // Arrange
        const a = makeElement(40, 30, 10, 20);
        const b = makeElement(50, 20, 100, 150);
        document.body.append(a, b);
        manager.toggle(a);
        manager.toggle(b);

        // Act
        const summary = manager.computeSummary();

        // Assert
        expect(summary.boundingBox).toEqual({
            left: 10,
            top: 20,
            right: 150,
            bottom: 170,
            width: 140,
            height: 150,
        });
    });

    it('reports consecutive-pair distances in selection order', () => {
        // Arrange
        const a = makeElement(10, 10, 0, 0);
        const b = makeElement(10, 10, 50, 0);
        const c = makeElement(10, 10, 100, 0);
        document.body.append(a, b, c);
        manager.toggle(a);
        manager.toggle(b);
        manager.toggle(c);

        // Act
        const summary = manager.computeSummary();

        // Assert
        expect(summary.pairs).toHaveLength(2);
        expect(summary.pairs[0].fromIndex).toBe(0);
        expect(summary.pairs[0].toIndex).toBe(1);
        expect(Math.round(summary.pairs[0].horizontal)).toBe(40);
    });

    it('detects parent-child containment between selected elements', () => {
        // Arrange
        const parent = document.createElement('section');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);
        parent.getBoundingClientRect = makeElement(100, 100, 0, 0).getBoundingClientRect;
        child.getBoundingClientRect = makeElement(50, 50, 10, 10).getBoundingClientRect;
        manager.toggle(parent);

        // Act
        const hasContainment = manager.hasContainmentWith(child);

        // Assert
        expect(hasContainment).toBe(true);
    });
});
