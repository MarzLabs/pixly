import type { AnnotationToolSpec } from './annotation-tool';
import { ArrowTool } from './arrow-tool';
import { EllipseTool } from './ellipse-tool';
import { EmojiTool } from './emoji-tool';
import { LineTool } from './line-tool';
import { RectTool } from './rect-tool';
import { TextTool } from './text-tool';

/**
 * The annotation tool registry. The editor toolbar, the canvas renderer and the state sanitizer
 * are all driven by this list, so adding a new annotation tool is one module + one entry here
 * (the same one-line-registration rule as the top-level ToolRegistry, RF-CORE-1).
 */
export const ANNOTATION_TOOLS: readonly AnnotationToolSpec[] = [
  ArrowTool,
  LineTool,
  RectTool,
  EllipseTool,
  TextTool,
  EmojiTool,
];

/** The arrow doubles as the default for fresh state and unknown persisted ids. */
export const DEFAULT_ANNOTATION_TOOL_ID = ArrowTool.id;

const toolsById = new Map(ANNOTATION_TOOLS.map((tool) => [tool.id, tool]));

export function getAnnotationTool(id: string): AnnotationToolSpec | undefined {
  return toolsById.get(id);
}

export function isAnnotationToolId(id: string): boolean {
  return toolsById.has(id);
}
