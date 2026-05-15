import { beforeEach, describe, expect, it } from 'vitest';
import {
    HoverTooltipCoordinator,
    TooltipSectionPriority,
    type TooltipSectionPayload,
} from './hover-tooltip-coordinator';

const TEST_SECTION_COUNT_AFTER_DISPOSE = 0;
const TEST_SECTION_COUNT_AFTER_CLEAR = 0;

function makeElementWithSelector(tag: string, id: string | null, classNames: string[]): Element {
    const element = document.createElement(tag);

    if (id) {
        element.id = id;
    }

    for (const className of classNames) {
        element.classList.add(className);
    }

    return element;
}

function makeAnchorRect(): DOMRect {
    return {
        x: 100,
        y: 100,
        left: 100,
        top: 100,
        right: 200,
        bottom: 150,
        width: 100,
        height: 50,
        toJSON: () => ({}),
    } as DOMRect;
}

const COLOR_PAYLOAD: TooltipSectionPayload = {
    title: 'Color de fondo',
    rows: [
        { label: 'hex', value: '#2D2E3F', copyValue: '#2D2E3F' },
        { label: 'rgb', value: 'rgba(45,46,63,1)', copyValue: 'rgba(45,46,63,1)' },
    ],
};

const TYPOGRAPHY_PAYLOAD: TooltipSectionPayload = {
    title: 'Tipografía',
    rows: [
        { label: 'font-family', value: 'Inter', copyValue: 'Inter' },
        { label: 'font-size', value: '16px', copyValue: '16px' },
    ],
};

const DIMENSIONS_PAYLOAD: TooltipSectionPayload = {
    title: 'Dimensiones',
    rows: [
        { label: 'width × height', value: '612 × 56' },
    ],
};

describe('HoverTooltipCoordinator (logic)', () => {
    let coordinator: HoverTooltipCoordinator;

    beforeEach(() => {
        coordinator = new HoverTooltipCoordinator();
    });

    it('returns an empty model when no sections have been updated', () => {
        // Arrange
        coordinator.registerSection('color', TooltipSectionPriority.Color);

        // Act
        const model = coordinator.composeModel();

        // Assert
        expect(model.sections).toHaveLength(0);
        expect(model.headerText).toBeNull();
    });

    it('aggregates payloads from multiple registered sections', () => {
        // Arrange
        const color = coordinator.registerSection('color', TooltipSectionPriority.Color);
        const typography = coordinator.registerSection('typography', TooltipSectionPriority.Typography);
        color.update(COLOR_PAYLOAD);
        typography.update(TYPOGRAPHY_PAYLOAD);

        // Act
        const model = coordinator.composeModel();

        // Assert
        expect(model.sections).toHaveLength(2);
        expect(model.sections.map((section) => section.title)).toEqual(['Color de fondo', 'Tipografía']);
    });

    it('orders sections by priority regardless of registration order', () => {
        // Arrange — typography registered first but it has higher priority value
        // so it must appear after dimensions in the output.
        const typography = coordinator.registerSection('typography', TooltipSectionPriority.Typography);
        const dimensions = coordinator.registerSection('dimensions', TooltipSectionPriority.Dimensions);
        typography.update(TYPOGRAPHY_PAYLOAD);
        dimensions.update(DIMENSIONS_PAYLOAD);

        // Act
        const model = coordinator.composeModel();

        // Assert
        expect(model.sections.map((section) => section.title)).toEqual(['Dimensiones', 'Tipografía']);
    });

    it('omits sections whose payload was cleared', () => {
        // Arrange
        const color = coordinator.registerSection('color', TooltipSectionPriority.Color);
        const typography = coordinator.registerSection('typography', TooltipSectionPriority.Typography);
        color.update(COLOR_PAYLOAD);
        typography.update(TYPOGRAPHY_PAYLOAD);

        // Act
        color.clear();
        const model = coordinator.composeModel();

        // Assert
        expect(model.sections).toHaveLength(1);
        expect(model.sections[0].title).toBe('Tipografía');
    });

    it('removes a section entirely when disposed', () => {
        // Arrange
        const color = coordinator.registerSection('color', TooltipSectionPriority.Color);
        color.update(COLOR_PAYLOAD);

        // Act
        color.dispose();
        const model = coordinator.composeModel();

        // Assert
        expect(model.sections).toHaveLength(TEST_SECTION_COUNT_AFTER_DISPOSE);
    });

    it('overwrites an existing section when the same id is re-registered', () => {
        // Arrange — first registration uses one priority.
        const first = coordinator.registerSection('color', TooltipSectionPriority.Color);
        first.update(COLOR_PAYLOAD);

        // Act — re-register the same id with a different priority. The old
        // payload must be wiped so the freshly-registered section starts empty.
        coordinator.registerSection('color', TooltipSectionPriority.Dimensions);

        // Assert
        const model = coordinator.composeModel();
        expect(model.sections).toHaveLength(TEST_SECTION_COUNT_AFTER_CLEAR);
    });

    it('exposes a compact selector for the current target as headerText', () => {
        // Arrange
        coordinator.registerSection('color', TooltipSectionPriority.Color);
        const element = makeElementWithSelector('div', null, ['search-box']);
        document.body.appendChild(element);

        // Act
        coordinator.setTarget(element, makeAnchorRect());

        // Assert
        expect(coordinator.composeModel().headerText).toBe('div.search-box');
    });

    it('returns no header when the target is cleared', () => {
        // Arrange
        const element = makeElementWithSelector('div', 'main', []);
        document.body.appendChild(element);
        coordinator.setTarget(element, makeAnchorRect());

        // Act
        coordinator.setTarget(null, null);

        // Assert
        expect(coordinator.composeModel().headerText).toBeNull();
    });

    it('keeps section data across target changes (target is independent from sections)', () => {
        // Arrange
        const color = coordinator.registerSection('color', TooltipSectionPriority.Color);
        color.update(COLOR_PAYLOAD);
        const first = makeElementWithSelector('div', null, ['a']);
        const second = makeElementWithSelector('span', null, ['b']);
        document.body.append(first, second);

        // Act — re-anchor to a different element. Sections must remain intact;
        // it's the tool's job to call clear()/update() when the data changes.
        coordinator.setTarget(first, makeAnchorRect());
        coordinator.setTarget(second, makeAnchorRect());

        // Assert
        const model = coordinator.composeModel();
        expect(model.sections).toHaveLength(1);
        expect(model.headerText).toBe('span.b');
    });
});
