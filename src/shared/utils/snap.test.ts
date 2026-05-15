import { describe, expect, it } from 'vitest';
import { applySnap, type SnapCandidate } from './snap';

describe('applySnap', () => {
    it('returns the same position when no candidate is within the threshold', () => {
        // Arrange
        const candidates: SnapCandidate[] = [
            { position: 100, kind: 'edge', target: document.createElement('div') },
        ];

        // Act
        const result = applySnap(50, candidates, 5);

        // Assert
        expect(result.position).toBe(50);
        expect(result.candidate).toBeNull();
    });

    it('snaps to the closest candidate within the threshold', () => {
        // Arrange
        const candidates: SnapCandidate[] = [
            { position: 98, kind: 'edge', target: document.createElement('div') },
            { position: 110, kind: 'edge', target: document.createElement('div') },
        ];

        // Act
        const result = applySnap(100, candidates, 5);

        // Assert
        expect(result.position).toBe(98);
        expect(result.candidate?.kind).toBe('edge');
    });

    it('prefers edge over center when distances are equal', () => {
        // Arrange
        const candidates: SnapCandidate[] = [
            { position: 95, kind: 'center', target: document.createElement('div') },
            { position: 95, kind: 'edge', target: document.createElement('div') },
        ];

        // Act
        const result = applySnap(100, candidates, 10);

        // Assert
        expect(result.candidate?.kind).toBe('edge');
    });

    it('prefers center over baseline when distances are equal', () => {
        // Arrange
        const candidates: SnapCandidate[] = [
            { position: 95, kind: 'baseline', target: document.createElement('div') },
            { position: 95, kind: 'center', target: document.createElement('div') },
        ];

        // Act
        const result = applySnap(100, candidates, 10);

        // Assert
        expect(result.candidate?.kind).toBe('center');
    });
});
