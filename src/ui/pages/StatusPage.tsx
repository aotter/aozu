export function StatusPage({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-svh place-items-center p-6">
    <p className="text-center text-sm text-muted-foreground">{children}</p>
  </main>
}
