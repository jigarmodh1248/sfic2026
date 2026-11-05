import { AppShell } from "../components/AppShell";

export function QueryPage() {
  return (
    <AppShell>
      <h1 className="text-xl font-bold">Performance query</h1>
      <p className="mt-2 text-sm text-slate-500">
        Plant → unit → parameters → period selection arrives with the next build.
      </p>
    </AppShell>
  );
}
