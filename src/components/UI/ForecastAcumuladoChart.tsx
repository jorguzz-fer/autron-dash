"use client";

import { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";
import ApexChartClient from "./ApexChartClient";

interface Props {
  categories: string[];
  /** Realizado acumulado mês a mês (fat. líquido emitido + carteira líq. −17%). */
  realizadoAcum: number[];
  /** Meta de receita líquida acumulada mês a mês. */
  metaAcum: number[];
  /**
   * Por mês: true = já apurado (NF emitida → barra verde),
   * false = projeção a partir da carteira (barra vermelha).
   */
  realizadoFlags: boolean[];
  height?: number;
}

const COR_REALIZADO = "#10b981"; // verde — mês apurado
const COR_PROJETADO = "#e11d48"; // vermelho — projeção
const COR_META = "#94a3b8"; // cinza — linha de meta

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

export default function ForecastAcumuladoChart({
  categories,
  realizadoAcum,
  metaAcum,
  realizadoFlags,
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

  const barData = realizadoAcum.map((y, i) => ({
    x: categories[i],
    y,
    fillColor: realizadoFlags[i] ? COR_REALIZADO : COR_PROJETADO,
  }));
  const metaData = metaAcum.map((y, i) => ({ x: categories[i], y }));

  // Rótulo por barra: neutro nos meses apurados, vermelho de destaque na projeção.
  const corLabelProjetado = isDark ? "#fb7185" : COR_PROJETADO;
  const dataLabelColors = realizadoFlags.map((apurado) =>
    apurado ? fgColor : corLabelProjetado,
  );

  const options: ApexOptions = {
    chart: {
      toolbar: { show: false },
      background: "transparent",
      foreColor: fgColor,
      fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      stacked: false,
    },
    theme: { mode: isDark ? "dark" : "light" },
    colors: [COR_REALIZADO, COR_META],
    dataLabels: {
      enabled: true,
      enabledOnSeries: [0],
      // distributed: indexa style.colors por barra (ponto), não por série —
      // necessário pois o gráfico é misto (column + line).
      distributed: true,
      formatter: (val) => fmtCompact(Number(val)),
      offsetY: -14,
      style: { fontSize: "9px", fontWeight: 700, colors: dataLabelColors },
      background: { enabled: false },
    },
    stroke: { width: [0, 2.5], curve: "smooth", dashArray: [0, 5] },
    plotOptions: {
      bar: {
        borderRadius: 3,
        columnWidth: "60%",
        dataLabels: { position: "top", orientation: "vertical" },
      },
    },
    markers: { size: [0, 3] },
    grid: {
      borderColor: gridColor,
      strokeDashArray: 0,
      padding: { left: 4, right: 4, top: 16 },
    },
    xaxis: {
      type: "category",
      labels: { style: { fontSize: "11px" } },
      axisBorder: { color: gridColor },
      axisTicks: { color: gridColor },
    },
    yaxis: {
      labels: { style: { fontSize: "11px" }, formatter: fmtCompact },
    },
    tooltip: {
      theme: isDark ? "dark" : "light",
      shared: true,
      intersect: false,
      y: { formatter: fmtCompact },
    },
    legend: {
      position: "top",
      fontSize: "12px",
      itemMargin: { horizontal: 12 },
    },
  };

  const series = [
    { name: "Realizado acumulado", type: "column", data: barData },
    { name: "Meta acumulada", type: "line", data: metaData },
  ];

  return (
    <ApexChartClient
      options={options}
      series={series}
      type="line"
      height={height}
      remountKey={`forecast-acum-${theme}`}
    />
  );
}
