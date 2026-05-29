"use client";

import { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";
import ApexChartClient from "./ApexChartClient";

interface Props {
  categories: string[];
  /** Faturamento líquido acumulado — ano anterior (12 valores). */
  dataAnoAnt: number[];
  /**
   * Faturamento líquido acumulado — ano atual.
   * Meses futuros devem vir como 0 (barra não aparece).
   */
  dataAnoAt: number[];
  /**
   * % crescimento acumulado mês a mês (null = sem dado ainda).
   * Ex: [(acumAt - acumAnt) / acumAnt * 100] por mês.
   */
  crescimento: (number | null)[];
  anoAnterior: number;
  anoAtual: number;
  height?: number;
}

function fmtCompact(n: number): string {
  return Math.abs(n) >= 1_000_000
    ? n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: "compact",
        maximumFractionDigits: 1,
      })
    : n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      });
}

function fmtPct(v: number | null): string {
  if (v == null || isNaN(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default function AcumuladoYoYChart({
  categories,
  dataAnoAnt,
  dataAnoAt,
  crescimento,
  anoAnterior,
  anoAtual,
  height = 340,
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
      stacked: false,
    },
    theme: { mode: isDark ? "dark" : "light" },
    // [0] = barras 2025 (cinza), [1] = barras 2026 (teal), [2] = linha % (âmbar)
    colors: ["#525252", "#009da4", "#f59e0b"],
    dataLabels: { enabled: false },
    stroke: {
      width: [0, 0, 2.5],
      curve: "smooth",
      dashArray: [0, 0, 0],
    },
    plotOptions: {
      bar: {
        borderRadius: 3,
        columnWidth: "65%",
      },
    },
    markers: {
      size: [0, 0, 4],
      strokeWidth: 0,
      colors: ["#f59e0b"],
    },
    grid: {
      borderColor: gridColor,
      strokeDashArray: 0,
      padding: { left: 4, right: 12, top: 8 },
    },
    xaxis: {
      type: "category",
      categories,
      labels: { style: { fontSize: "11px" } },
      axisBorder: { color: gridColor },
      axisTicks: { color: gridColor },
    },
    yaxis: [
      {
        // eixo esquerdo — valores R$ — escala compartilhada pelas 2 séries de barra
        seriesName: String(anoAnterior),
        labels: {
          style: { fontSize: "11px" },
          formatter: fmtCompact,
        },
      },
      {
        // série 2026 usa EXATAMENTE a mesma escala de 2025 (seriesName idêntico)
        seriesName: String(anoAnterior),
        show: false,
        labels: { formatter: fmtCompact },
      },
      {
        // eixo direito — % crescimento (linha)
        seriesName: "Crescimento % acum.",
        opposite: true,
        labels: {
          style: { fontSize: "11px", colors: ["#f59e0b"] },
          formatter: (v: number) => fmtPct(v),
        },
        title: {
          text: "Crescimento %",
          style: { color: "#f59e0b", fontSize: "11px", fontWeight: 500 },
        },
      },
    ],
    tooltip: {
      theme: isDark ? "dark" : "light",
      shared: true,
      intersect: false,
      y: {
        formatter: (val: number, opts?: { seriesIndex?: number }) => {
          if (opts?.seriesIndex === 2) return fmtPct(val);
          return val > 0 ? fmtCompact(val) : "—";
        },
      },
    },
    legend: {
      position: "top",
      fontSize: "12px",
      itemMargin: { horizontal: 12 },
    },
  };

  const series = [
    {
      name: String(anoAnterior),
      type: "column",
      data: dataAnoAnt,
    },
    {
      name: String(anoAtual),
      type: "column",
      data: dataAnoAt,
    },
    {
      name: "Crescimento % acum.",
      type: "line",
      // ApexCharts aceita null para quebrar a linha onde não há dado
      data: crescimento.map((v) => (v != null ? parseFloat(v.toFixed(2)) : null)),
    },
  ];

  return (
    <ApexChartClient
      options={options}
      series={series as ApexOptions["series"]}
      type="line"
      height={height}
      remountKey={`acum-yoy-${theme}`}
    />
  );
}
