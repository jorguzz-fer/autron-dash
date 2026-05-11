"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApexOptions } from "apexcharts";
import HBarRanking from "./HBarRanking";
import ApexChartClient from "./ApexChartClient";

export interface DistributionItem {
  label: string;
  value: number;
  display?: string;
}

export type DistributionView = "bar" | "pie" | "donut" | "line" | "table";
export type ValueFormat = "number" | "currency" | "currencyCompact" | "percent";

function makeFormatter(fmt: ValueFormat): (n: number) => string {
  switch (fmt) {
    case "currency":
      return (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "currencyCompact":
      return (n) =>
        Math.abs(n) >= 1000
          ? n.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
              notation: "compact",
              maximumFractionDigits: 1,
            })
          : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "percent":
      return (n) => `${n.toFixed(1)}%`;
    default:
      return (n) => n.toLocaleString("pt-BR");
  }
}

interface Props {
  data: DistributionItem[];
  view: DistributionView;
  valueFormat?: ValueFormat;
  height?: number;
  hbarTone?: "brand" | "success" | "warning" | "danger";
}

const PALETTE = [
  "#5ea6ac",
  "#10b981",
  "#f59e0b",
  "#e11d48",
  "#8b5cf6",
  "#3d8e94",
  "#6366f1",
  "#84cc16",
  "#f97316",
  "#ec4899",
];

export default function DistributionChart({
  data,
  view,
  valueFormat = "number",
  height = 280,
  hbarTone = "brand",
}: Props) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const t = (document.documentElement.dataset.theme as "light" | "dark") || "dark";
    setTheme(t);
    const obs = new MutationObserver(() => {
      const newTheme = (document.documentElement.dataset.theme as "light" | "dark") || "dark";
      setTheme(newTheme);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const formatter = useMemo(() => makeFormatter(valueFormat), [valueFormat]);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-[13px]" style={{ color: "var(--fg-muted)" }}>
        Sem dados.
      </p>
    );
  }

  if (view === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr
              className="text-[10.5px] uppercase tracking-wider"
              style={{
                color: "var(--fg-muted)",
                backgroundColor: "var(--surface-2)",
              }}
            >
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr
                key={`${i}-${d.label}`}
                style={{ borderTop: "1px solid var(--border-soft)" }}
              >
                <td className="px-3 py-2" style={{ color: "var(--fg)" }}>
                  {d.label}
                </td>
                <td
                  className="numeric px-3 py-2 text-right font-medium"
                  style={{ color: "var(--fg-strong)" }}
                >
                  {d.display ?? formatter(d.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view === "bar") {
    return (
      <HBarRanking
        items={data.map((d) => ({ label: d.label, value: d.value, display: d.display }))}
        tone={hbarTone}
      />
    );
  }

  const isDark = theme === "dark";
  const fgColor = isDark ? "#8a94a6" : "#64748b";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "#e6ebf1";

  if (view === "line") {
    const options: ApexOptions = {
      chart: {
        toolbar: { show: false },
        background: "transparent",
        foreColor: fgColor,
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      },
      theme: { mode: isDark ? "dark" : "light" },
      colors: [PALETTE[0]],
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 2.5 },
      grid: { borderColor: gridColor },
      xaxis: {
        categories: data.map((d) => d.label),
        labels: { style: { fontSize: "11px" } },
      },
      yaxis: { labels: { formatter, style: { fontSize: "11px" } } },
      tooltip: { theme: isDark ? "dark" : "light", y: { formatter } },
    };
    return (
      <ApexChartClient
        options={options}
        series={[{ name: "Valor", data: data.map((d) => d.value) }]}
        type="line"
        height={height}
        remountKey={`line-${theme}-${valueFormat}`}
      />
    );
  }

  const isDonut = view === "donut";
  const options: ApexOptions = {
    chart: {
      background: "transparent",
      foreColor: fgColor,
      fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    },
    theme: { mode: isDark ? "dark" : "light" },
    colors: PALETTE,
    labels: data.map((d) => d.label),
    legend: { position: "bottom", fontSize: "12px" },
    dataLabels: { enabled: true, formatter: (v) => `${(v as number).toFixed(0)}%` },
    plotOptions: isDonut ? { pie: { donut: { size: "62%" } } } : {},
    tooltip: { theme: isDark ? "dark" : "light", y: { formatter } },
    stroke: { width: 1, colors: [isDark ? "#0d1322" : "#ffffff"] },
  };
  return (
    <ApexChartClient
      options={options}
      series={data.map((d) => d.value)}
      type={isDonut ? "donut" : "pie"}
      height={height}
      remountKey={`${view}-${theme}-${data.length}-${valueFormat}`}
    />
  );
}
