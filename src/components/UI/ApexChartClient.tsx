"use client";

import { useEffect, useRef } from "react";
import type { ApexOptions } from "apexcharts";

interface Props {
  options: ApexOptions;
  series: ApexOptions["series"];
  type:
    | "line"
    | "area"
    | "bar"
    | "pie"
    | "donut"
    | "radialBar"
    | "scatter"
    | "bubble"
    | "heatmap"
    | "candlestick"
    | "boxPlot"
    | "radar"
    | "polarArea"
    | "rangeBar"
    | "rangeArea"
    | "treemap";
  height?: number;
  /**
   * Chave de força-remontagem. Quando muda, o chart é destruído e recriado
   * limpo (em vez de tentar updateOptions, que pode falhar com mudanças
   * estruturais como bar→pie).
   */
  remountKey?: string;
}

/**
 * Wrapper minimalista do ApexCharts (sem `react-apexcharts`, que tem
 * peer-dep React 18 e quebra com React 19 mesmo com --legacy-peer-deps).
 *
 * Cria a instância via `new ApexCharts()` no useEffect e destrói no cleanup.
 */
export default function ApexChartClient({ options, series, type, height = 280, remountKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const node = containerRef.current;
    if (!node) return;

    (async () => {
      const mod = await import("apexcharts");
      if (cancelled || !node) return;

      // Aguarda um frame para garantir que o container tem dimensões CSS resolvidas.
      // Necessário para pie/donut que precisam de largura definida no constructor.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled || !node) return;

      const ApexCharts = mod.default;
      const fullOptions = {
        ...options,
        chart: { ...options.chart, type, height, width: "100%" },
        series,
      };
      let chart: InstanceType<typeof ApexCharts> | null = null;
      try {
        chart = new ApexCharts(node, fullOptions);
      } catch (e) {
        console.error("[ApexChartClient] constructor error", e);
        return;
      }
      if (cancelled) {
        try { chart.destroy(); } catch { /* já destruído */ }
        return;
      }
      try {
        await chart.render();
      } catch (e) {
        console.error("[ApexChartClient] render error", e);
        try { chart.destroy(); } catch { /* já destruído */ }
        return;
      }
      if (cancelled) {
        try { chart.destroy(); } catch { /* já destruído */ }
        return;
      }
      chartRef.current = chart;
    })();

    return () => {
      cancelled = true;
      if (chartRef.current) {
        try {
          chartRef.current.destroy();
        } catch {
          // já destruído
        }
        chartRef.current = null;
      }
    };
    // remountKey controla recriação completa. Outras mudanças não disparam re-render
    // (Apex tem updateOptions/updateSeries pra isso, mas pra mudanças estruturais
    // re-criar é mais seguro).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, height, remountKey]);

  // Atualiza dados sem destruir (suave) quando series/options mudam mas type é o mesmo
  useEffect(() => {
    if (!chartRef.current) return;
    try {
      chartRef.current.updateOptions(options, false, true, true);
    } catch {
      // ignora — próxima troca de remountKey reconstrói
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options)]);

  useEffect(() => {
    if (!chartRef.current) return;
    try {
      chartRef.current.updateSeries(series, true);
    } catch {
      // ignora
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(series)]);

  return <div ref={containerRef} />;
}
