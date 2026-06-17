"use client";

export function PlaygroundClient({
  companies,
}: {
  companies: { id: string; name: string }[];
}) {
  // companies será usado na Task 9; renderizamos a contagem para evitar unused-var.
  return (
    <div className="p-6">
      <p className="text-sm text-muted-foreground">
        Playground (em breve) — {companies.length} ótica(s) disponível(is).
      </p>
    </div>
  );
}
