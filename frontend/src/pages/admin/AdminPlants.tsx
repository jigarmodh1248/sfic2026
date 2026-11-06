/* Admin: read-only plant/unit inventory. */

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../../components/AppShell";
import { EmptyState } from "../../components/ui";
import { api } from "../../lib/api";
import type { Plant, Unit } from "../../types/api";

export function AdminPlantsPage() {
  const plantsQuery = useQuery({
    queryKey: ["plants"],
    queryFn: () => api.get<Plant[]>("/plants").then((r) => r.data),
  });
  const unitsQuery = useQuery({
    queryKey: ["units", "all"],
    queryFn: () => api.get<Unit[]>("/units").then((r) => r.data),
  });

  const plants = plantsQuery.data ?? [];
  const units = unitsQuery.data ?? [];

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Plants &amp; Units</h1>
      <p className="mt-1 text-sm text-slate-500">Read-only inventory. Plant data is seeded.</p>

      {plantsQuery.isLoading || unitsQuery.isLoading ? (
        <EmptyState message="Loading…" />
      ) : plants.length === 0 ? (
        <EmptyState message="No plants defined" />
      ) : (
        <div className="mt-4 space-y-4">
          {plants.map((plant) => {
            const plantUnits = units.filter((u) => u.plant_id === plant.id);
            return (
              <section key={plant.id} className="rounded-lg bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <h2 className="text-base font-semibold">{plant.name}</h2>
                  {plant.location && <span className="text-sm text-slate-500">{plant.location}</span>}
                  <span className="text-xs uppercase text-slate-500">
                    {plantUnits.length} unit{plantUnits.length === 1 ? "" : "s"}
                  </span>
                </div>
                {plantUnits.length > 0 ? (
                  <table className="mt-3 w-full text-left text-sm">
                    <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Unit</th>
                        <th className="px-3 py-2 text-right">Capacity (MW)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plantUnits.map((u) => (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="px-3 py-1.5 font-medium">{u.unit_number}</td>
                          <td className="px-3 py-1.5 text-right">{u.capacity_mw ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No units for this plant.</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
