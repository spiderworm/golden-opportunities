import type { Route } from "./+types/route";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Orbital Books" },
    { name: "description", content: "Run a bookstore in orbit, and find out what your data is telling you." },
  ];
}

export default function Station() {
  return (
    <main style={{ padding: 32 }}>
      <h1>Orbital Books</h1>
      <p style={{ color: "var(--color-text-muted)" }}>Station systems coming online.</p>
    </main>
  );
}
