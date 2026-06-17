/**
 * CreatorStudio — Creator Studio page wrapper
 * Wraps the Studio Command Center with GlassPageShell theming
 */
import { GlassPageShell } from "@/components/ui/glass/GlassPageShell";
import { CreatorStudioPage } from "@/components/ui/glass/CreatorStudioPage";

export default function CreatorStudio() {
  return (
    <GlassPageShell fullHeight initialTheme="dark">
      {() => <CreatorStudioPage />}
    </GlassPageShell>
  );
}
