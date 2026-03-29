export function addPropertyControls(
  _component: unknown,
  _controls: Record<string, unknown>
): void {}

export const ControlType = {
  String: "string",
  Number: "number",
  Boolean: "boolean",
  Color: "color",
  Enum: "enum",
  Object: "object",
  Transition: "transition",
} as const

export const RenderTarget = {
  current(): string {
    return "preview"
  },
  canvas: "canvas",
  preview: "preview",
  export: "export",
  thumbnail: "thumbnail",
} as const
