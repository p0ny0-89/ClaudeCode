import { ToolcraftApp } from "@/toolcraft/runtime/react";

import { handleMuralPanelAction } from "../app/app-export";
import { appSchema } from "../app/app-schema";
import { MuralRenderer } from "../app/mural-renderer";
import { MuralToolbar } from "../app/mural-toolbar";

export function AppHome(): React.JSX.Element {
  return (
    <ToolcraftApp
      canvasContent={
        <>
          <MuralRenderer />
          <MuralToolbar />
        </>
      }
      className="h-dvh min-h-dvh"
      onPanelAction={handleMuralPanelAction}
      renderDefaultCanvasMedia={false}
      schema={appSchema}
    />
  );
}
