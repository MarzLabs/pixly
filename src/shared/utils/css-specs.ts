// Builds a structured snapshot of the CSS properties most relevant to QA work.

import { cssColorToHex } from './colors';

export interface ElementSpecs {
    tag: string;
    dimensions: { width: string; height: string };
    spacing: { padding: string; margin: string };
    typography: {
        fontFamily: string;
        fontSize: string;
        lineHeight: string;
        letterSpacing: string;
        fontWeight: string;
        color: string;
        colorHex: string | null;
    };
    background: {
        backgroundColor: string;
        backgroundColorHex: string | null;
        backgroundImage: string;
    };
    border: {
        border: string;
        borderRadius: string;
    };
    shadow: string;
    position: {
        display: string;
        position: string;
        top: string;
        right: string;
        bottom: string;
        left: string;
        zIndex: string;
    };
}

export function buildElementSpecs(element: Element): ElementSpecs {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return {
        tag: element.tagName.toLowerCase(),
        dimensions: {
            width: `${Math.round(rect.width)}px`,
            height: `${Math.round(rect.height)}px`,
        },
        spacing: {
            padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
            margin: `${style.marginTop} ${style.marginRight} ${style.marginBottom} ${style.marginLeft}`,
        },
        typography: {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            letterSpacing: style.letterSpacing,
            fontWeight: style.fontWeight,
            color: style.color,
            colorHex: cssColorToHex(style.color),
        },
        background: {
            backgroundColor: style.backgroundColor,
            backgroundColorHex: cssColorToHex(style.backgroundColor),
            backgroundImage: style.backgroundImage,
        },
        border: {
            border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
            borderRadius: style.borderRadius,
        },
        shadow: style.boxShadow,
        position: {
            display: style.display,
            position: style.position,
            top: style.top,
            right: style.right,
            bottom: style.bottom,
            left: style.left,
            zIndex: style.zIndex,
        },
    };
}

export function formatSpecsForClipboard(specs: ElementSpecs): string {
    const lines: string[] = [
        `Element: <${specs.tag}>`,
        '',
        '## Dimensions',
        `width: ${specs.dimensions.width}`,
        `height: ${specs.dimensions.height}`,
        '',
        '## Spacing',
        `padding: ${specs.spacing.padding}`,
        `margin: ${specs.spacing.margin}`,
        '',
        '## Typography',
        `font-family: ${specs.typography.fontFamily}`,
        `font-size: ${specs.typography.fontSize}`,
        `line-height: ${specs.typography.lineHeight}`,
        `letter-spacing: ${specs.typography.letterSpacing}`,
        `font-weight: ${specs.typography.fontWeight}`,
        `color: ${specs.typography.color}${specs.typography.colorHex ? ` (${specs.typography.colorHex})` : ''}`,
        '',
        '## Background',
        `background-color: ${specs.background.backgroundColor}${specs.background.backgroundColorHex ? ` (${specs.background.backgroundColorHex})` : ''}`,
        `background-image: ${specs.background.backgroundImage}`,
        '',
        '## Border',
        `border: ${specs.border.border}`,
        `border-radius: ${specs.border.borderRadius}`,
        '',
        '## Shadow',
        `box-shadow: ${specs.shadow}`,
        '',
        '## Position',
        `display: ${specs.position.display}`,
        `position: ${specs.position.position}`,
        `top: ${specs.position.top}`,
        `right: ${specs.position.right}`,
        `bottom: ${specs.position.bottom}`,
        `left: ${specs.position.left}`,
        `z-index: ${specs.position.zIndex}`,
    ];

    return lines.join('\n');
}
