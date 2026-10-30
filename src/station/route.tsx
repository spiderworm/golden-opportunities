import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";

export const handle: ShellHandle = { title: "Station" };

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Orbital Books" },
    { name: "description", content: "Run a bookstore in orbit, and find out what your data is telling you." },
  ];
}

export default function Station() {
  return <p style={{ margin: 0, color: "var(--color-text-muted)" }}>Station systems coming online.</p>;
}
