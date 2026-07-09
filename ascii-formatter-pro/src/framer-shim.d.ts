declare module "framer" {
  export function addPropertyControls(
    component: React.ComponentType<any>,
    controls: Record<string, any>
  ): void

  export const ControlType: {
    String: string
    Number: string
    Boolean: string
    Color: string
    Enum: string
    Object: string
    Transition: string
  }

  export const RenderTarget: {
    current(): string
    canvas: string
    preview: string
    export: string
    thumbnail: string
  }
}
