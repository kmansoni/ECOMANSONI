import { Sparkles } from "lucide-react";

export function ARPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-3xl border border-border bg-card p-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Sparkles className="w-7 h-7 text-foreground" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">AR</h1>
        <p className="text-sm text-muted-foreground mt-2">Раздел в разработке.</p>
      </div>
    </div>
  );
}
