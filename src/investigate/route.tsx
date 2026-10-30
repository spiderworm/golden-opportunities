import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";

export const handle: ShellHandle = { title: "Investigate" };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Investigate | Orbital Books" }];
}

export default function Investigate() {
  return <p style={{ margin: 0, color: "var(--color-text-muted)" }}>Investigation tools coming online.</p>;
}
