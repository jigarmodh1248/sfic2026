/* All-roles: plant → unit → parameters → period → results, summary, chart, PDF. */

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { isAxiosError } from "axios";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "../components/AppShell";
import { EmptyState, PrimaryButton, SecondaryButton } from "../components/ui";
import { api } from "../lib/api";
import type {
  PeriodMode,
  Plant,
  QueryRequest,
  QueryResponse,
  ParameterMeta,
  Unit,
} from "../types/api";

const MAX_TABLE_ROWS = 300;
const LINE_COLORS = ["#0F4C81", "#E11D48", "#16A34A", "#D97706", "#7C3AED", "#0891B2"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
function currentYear(): string {
  return String(new Date().getFullYear());
}
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function QueryPage() {
  const [plantId, setPlantId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [mode, setMode] = useState<PeriodMode>("DAY");
  const [day, setDay] = useState(todayISO());
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(currentYear());
  const [start, setStart] = useState(daysAgoISO(7));
  const [end, setEnd] = useState(todayISO());
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const plantsQuery = useQuery({
    queryKey: ["plants"],
    queryFn: () => api.get<Plant[]>("/plants").then((r) => r.data),
  });
  const unitsQuery = useQuery({
    queryKey: ["units", plantId],
    queryFn: () =>
      api.get<Unit[]>(plantId ? `/units?plant_id=${plantId}` : "/units").then((r) => r.data),
    enabled: plantId !== "",
  });
  const paramsQuery = useQuery({
    queryKey: ["unit-params", unitId],
    queryFn: () => api.get<ParameterMeta[]>(`/units/${unitId}/parameters`).then((r) => r.data),
    enabled: unitId !== "",
  });

  const plantOptions = plantsQuery.data ?? [];
  const unitOptions = unitsQuery.data ?? [];
  const parameterOptions = paramsQuery.data ?? [];

  function pickPlant(id: string) {
    setPlantId(id);
    setUnitId("");
    setSelectedParams([]);
    setResult(null);
  }

  function pickUnit(id: string) {
    setUnitId(id);
    setSelectedParams([]);
    setResult(null);
  }

  function toggleParam(name: string) {
    setSelectedParams((current) =>
      current.includes(name) ? current.filter((p) => p !== name) : [...current, name],
    );
  }

  function buildPeriod(): QueryRequest["period"] {
    switch (mode) {
      case "DAY":
        return { mode, day };
      case "MONTH":
        return { mode, month };
      case "YEAR":
        return { mode, year };
      case "RANGE":
        return { mode, start, end };
    }
  }

  function describePeriod(): string {
    switch (mode) {
      case "DAY":
        return `Day ${day}`;
      case "MONTH":
        return `Month ${month}`;
      case "YEAR":
        return `Year ${year}`;
      case "RANGE":
        return `${start} to ${end}`;
    }
  }

  async function runQuery() {
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const body: QueryRequest = {
        plant_id: plantId,
        unit_id: unitId,
        parameters: selectedParams,
        period: buildPeriod(),
      };
      const r = await api.post<QueryResponse>("/query", body);
      setResult(r.data);
    } catch (err) {
      setError(readableError(err, "Query failed"));
    } finally {
      setRunning(false);
    }
  }

  async function downloadPdf() {
    setError(null);
    setDownloadingPdf(true);
    try {
      const body: QueryRequest = {
        plant_id: plantId,
        unit_id: unitId,
        parameters: selectedParams,
        period: buildPeriod(),
      };
      const r = await api.post("/report/pdf", body, { responseType: "blob" });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement("a");
      const unitLabel = unitOptions.find((u) => u.id === unitId)?.unit_number ?? "unit";
      a.href = url;
      a.download = `${unitLabel.replace(" ", "_")}_${describePeriod().replace(/[\s:]/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not generate the PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  function readableError(err: unknown, fallback: string): string {
    if (isAxiosError(err)) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") return detail;
      return `${fallback} (${err.response?.status ?? "network"})`;
    }
    return fallback;
  }

  /** Chart dataset: one x entry per date, each parameter as a series value. */
  const chartData = useMemo(() => {
    if (!result) return [];
    const byDate = new Map<string, Record<string, number | string>>();
    for (const row of result.rows) {
      const entry = byDate.get(row.recorded_date) ?? { date: row.recorded_date };
      // if multiple values exist for same date+parameter (unlikely here), keep the last
      entry[row.parameter] = row.value;
      byDate.set(row.recorded_date, entry);
    }
    return [...byDate.values()];
  }, [result]);

  const chartParams = useMemo(() => {
    if (!result) return [];
    const names = new Set(result.rows.map((r) => r.parameter));
    return [...names];
  }, [result]);

  const rowsTruncated = result ? result.rows.slice(0, MAX_TABLE_ROWS) : [];
  const canRun = plantId !== "" && unitId !== "" && !running;

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Performance query</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pick a plant, a unit, any parameters (none = all), and a period.
      </p>

      <section className="mt-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">
            Plant
            <select
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              value={plantId}
              onChange={(e) => pickPlant(e.target.value)}
            >
              <option value="">Select plant…</option>
              {plantOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Unit
            <select
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              value={unitId}
              onChange={(e) => pickUnit(e.target.value)}
              disabled={plantId === ""}
            >
              <option value="">Select unit…</option>
              {unitOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_number}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm font-medium">
            Period
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {(["DAY", "MONTH", "YEAR", "RANGE"] as PeriodMode[]).map((m) => (
                <label key={m} className="flex items-center gap-1 font-normal">
                  <input
                    type="radio"
                    name="period-mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  {m}
                </label>
              ))}
            </div>
            <div className="mt-2">
              {mode === "DAY" && (
                <input
                  type="date"
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              )}
              {mode === "MONTH" && (
                <input
                  type="month"
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              )}
              {mode === "YEAR" && (
                <input
                  type="number"
                  min={1990}
                  max={2100}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              )}
              {mode === "RANGE" && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    aria-label="Start date"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="date"
                    aria-label="End date"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm font-medium">
          Parameters{" "}
          <span className="font-normal text-slate-500">(none selected = all parameters)</span>
          {unitId === "" ? (
            <p className="mt-1 text-sm text-slate-400">Choose a unit to load its parameters.</p>
          ) : paramsQuery.isLoading ? (
            <p className="mt-1 text-sm text-slate-400">Loading parameters…</p>
          ) : parameterOptions.length === 0 ? (
            <p className="mt-1 text-sm text-slate-400">No parameters recorded for this unit yet.</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {parameterOptions.map((p) => (
                <label key={p.parameter} className="flex items-center gap-1 text-sm font-normal">
                  <input
                    type="checkbox"
                    checked={selectedParams.includes(p.parameter)}
                    onChange={() => toggleParam(p.parameter)}
                  />
                  {p.parameter}
                  {p.uom && <span className="text-xs text-slate-400">({p.uom})</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <PrimaryButton onClick={() => void runQuery()} disabled={!canRun}>
            {running ? "Running…" : "Run query"}
          </PrimaryButton>
          <SecondaryButton
            onClick={() => void downloadPdf()}
            disabled={!canRun || downloadingPdf || result === null}
          >
            {downloadingPdf ? "Preparing…" : "Download PDF"}
          </SecondaryButton>
        </div>
        {error && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
      </section>

      {result && (
        <>
          <h2 className="mt-6 font-semibold">
            Summary <span className="text-sm font-normal text-slate-500">— {describePeriod()}</span>
          </h2>
          {result.summary.length === 0 ? (
            <EmptyState message="No data found for the selected criteria." />
          ) : (
            <>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {result.summary.map((s) => {
                  const uom = result.rows.find((r) => r.parameter === s.parameter)?.uom;
                  return (
                    <div key={s.parameter} className="rounded-lg bg-white p-4 shadow-sm">
                      <div className="text-sm font-medium">{s.parameter}</div>
                      {uom && <div className="text-xs text-slate-400">{uom}</div>}
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <dt className="text-xs uppercase text-slate-400">Min</dt>
                          <dd className="font-semibold">{formatNumber(s.min)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-slate-400">Max</dt>
                          <dd className="font-semibold">{formatNumber(s.max)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-slate-400">Avg</dt>
                          <dd className="font-semibold">{formatNumber(s.avg)}</dd>
                        </div>
                      </dl>
                    </div>
                  );
                })}
              </div>

              <h2 className="mt-6 font-semibold">Trend</h2>
              <div className="mt-2 h-72 rounded-lg bg-white p-4 shadow-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {chartParams.map((param, i) => (
                      <Line
                        key={param}
                        type="monotone"
                        dataKey={param}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <h2 className="mt-6 font-semibold">
                Records
                {result.rows.length > MAX_TABLE_ROWS && (
                  <span className="text-sm font-normal text-slate-500">
                    {" "}
                    — showing first {MAX_TABLE_ROWS} of {result.rows.length} (PDF export contains
                    all rows)
                  </span>
                )}
              </h2>
              <div className="mt-2 max-h-[28rem] overflow-auto rounded-lg bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 border-b bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Parameter</th>
                      <th className="px-4 py-2 text-right">Value</th>
                      <th className="px-4 py-2">UoM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsTruncated.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-1.5 whitespace-nowrap">{row.recorded_date}</td>
                        <td className="px-4 py-1.5">{row.parameter}</td>
                        <td className="px-4 py-1.5 text-right font-mono">{formatNumber(row.value)}</td>
                        <td className="px-4 py-1.5 text-slate-500">{row.uom ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
