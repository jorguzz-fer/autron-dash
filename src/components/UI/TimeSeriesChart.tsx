"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export interface TimeSeriesPoint {
  key: string;
  label: string;
  value: number;
}

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
  data: TimeSeriesPoint[];
  type?: "bar" | "line" | "area";
  color?: string;
  /**
   * Formato do eixo Y / tooltip. Use string identifier (não função, pra
   * permitir passar de RSC sem quebrar serialização).
   */
  valueFormat?: ValueFormat;
  height?: number;
  seriesName?: string;
}

export default function TimeSeriesChart({
  data,
  type = "bar",
  color = "#3b82f6",
  valueFormat = "number",
  height = 280,
  seriesName = "Valor",
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

  const isDark = theme === "dark";
  const fgColor = isDark ? "#8a94a6" : "#64748b";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "#e6ebf1";

  const options: ApexOptions = {
    chart: {
      type,
      toolbar: { show: false },
      background: "transparent",
      foreColor: fgColor,
      animations: { enabled: true, speed: 250 },
      fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    },
    theme: { mode: isDark ? "dark" : "light" },
    colors: [color],
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: type === "line" ? 2.5 : 0 },
    fill:
      type === "area"
        ? {
            type: "gradient",
            gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] },
          }
        : { opacity: 1 },
    plotOptions: { bar: { borderRadius: 4, columnWidth: "60%" } },
    grid: { borderColor: gridColor, strokeDashArray: 0, padding: { left: 4, right: 4 } },
    xaxis: {
      categories: data.map((d) => d.label),
      labels: { style: { fontSize: "11px" } },
      axisBorder: { color: gridColor },
      axisTicks: { color: gridColor },
    },
    yaxis: {
      labels: { formatter, style: { fontSize: "11px" } },
    },
    tooltip: {
      theme: isDark ? "dark" : "light",
      y: { formatter },
    },
  };

  const series = [{ name: seriesName, data: data.map((d) => d.value) }];

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-[13px]" style={{ color: "var(--fg-muted)" }}>
        Sem dados para o período.
      </p>
    );
  }

  return <Chart options={options} series={series} type={type} height={height} />;
}
