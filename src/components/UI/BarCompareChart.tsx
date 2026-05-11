"use client";

import { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";
import ApexChartClient from "./ApexChartClient";

export interface BarCompareSeries {
  name: string;
  data: number[];
}

interface Props {
  seriesA: BarCompareSeries; // ano de referência (e.g. 2025)
  seriesB: BarCompareSeries; // ano corrente (e.g. 2026)
  categories: string[];
  height?: number;
}

function fmtCompact(n: number): string {
  return Math.abs(n) >= 1000
    ? n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: "compact",
        maximumFractionDigits: 1,
      })
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function BarCompareChart({
  seriesA,
  seriesB,
  categories,
  height = 300,
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

  const isDark = theme === "dark";
  const fgColor = isDark ? "#8a94a6" : "#64748b";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "#e6ebf1";

  const options: ApexOptions = {
    chart: {
      toolbar: { show: false },
      background: "transparent",
      foreColor: fgColor,
      fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    },
    theme: { mode: isDark ? "dark" : "light" },
    colors: ["#525252", "#009da4"],
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    plotOptions: {
      bar: {
        borderRadius: 3,
        columnWidth: "65%",
      },
    },
    grid: {
      borderColor: gridColor,
      strokeDashArray: 0,
      padding: { left: 4, right: 4 },
    },
    xaxis: {
      categories,
      labels: { style: { fontSize: "11px" } },
      axisBorder: { color: gridColor },
      axisTicks: { color: gridColor },
    },
    yaxis: {
      labels: {
        style: { fontSize: "11px" },
        formatter: fmtCompact,
      },
    },
    tooltip: {
      theme: isDark ? "dark" : "light",
      y: { formatter: fmtCompact },
    },
    legend: {
      position: "top",
      fontSize: "12px",
      itemMargin: { horizontal: 12 },
    },
  };

  return (
    <ApexChartClient
      options={options}
      series={[seriesA, seriesB]}
      type="bar"
      height={height}
      remountKey={`bar-compare-${theme}`}
    />
  );
}
