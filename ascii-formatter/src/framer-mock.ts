// Runtime mock for the "framer" module — used in the dev harness only.
// In the real Framer editor, the actual "framer" package provides these.

export function addPropertyControls(
  _component: unknown,
  _controls: Record<string, unknown>
): void {
  // no-op in dev harness
}

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
    return "preview" // always "preview" in dev harness so effects run
  },
  canvas: "canvas",
  preview: "preview",
  export: "export",
  thumbnail: "thumbnail",
} as const
