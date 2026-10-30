import { AssistantPanel } from "~/assistant/ui/AssistantPanel";
import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";

export const handle: ShellHandle = { title: "Investigate" };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Investigate | Orbital Books" }];
}

export default function Investigate() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, color: "var(--color-text-muted)" }}>Investigation tools coming online.</p>
      <AssistantPanel />
    </div>
  );
}
