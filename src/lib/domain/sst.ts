/**
 * Inteligência de SST derivada do CNAE (puro, sem I/O).
 *
 * A partir do CNAE da Receita Federal derivamos, sem custo de API:
 *  - Grau de Risco ocupacional (NR-4, Quadro I): 1 a 4.
 *  - Estimativas de "SESMT provável" e "RH estruturado provável".
 *
 * ATENÇÃO — APROXIMAÇÃO: o Quadro I da NR-4 define o grau de risco por *subclasse*
 * CNAE (7 dígitos, ~1.300 itens). Aqui usamos o grau predominante por *divisão*
 * CNAE (2 primeiros dígitos), suficiente para TRIAGEM de prospecção SST. Os campos
 * devem ser tratados como estimativa. Para precisão regulatória, substituir
 * `GRAU_POR_DIVISAO` pela tabela completa do Quadro I.
 */

import { onlyDigits } from "./cnpj";

type Grau = 1 | 2 | 3 | 4;

// Divisão CNAE (2 díg.) → grau de risco predominante (NR-4 Quadro I).
const GRAU_POR_DIVISAO: Record<string, Grau> = {
  // Agropecuária / extrativismo
  "01": 3, "02": 3, "03": 3,
  // Indústrias extrativas
  "05": 4, "06": 3, "07": 4, "08": 3, "09": 3,
  // Indústrias de transformação (predominante 3)
  "10": 3, "11": 3, "12": 3, "13": 3, "14": 3, "15": 3, "16": 3, "17": 3,
  "18": 2, "19": 3, "20": 3, "21": 3, "22": 3, "23": 3, "24": 4, "25": 3,
  "26": 2, "27": 3, "28": 3, "29": 3, "30": 3, "31": 3, "32": 2, "33": 3,
  // Eletricidade e gás
  "35": 2,
  // Água, esgoto, resíduos
  "36": 2, "37": 3, "38": 3, "39": 3,
  // Construção
  "41": 4, "42": 4, "43": 3,
  // Comércio
  "45": 3, "46": 2, "47": 2,
  // Transporte e armazenagem
  "49": 3, "50": 3, "51": 3, "52": 3, "53": 3,
  // Alojamento e alimentação
  "55": 2, "56": 2,
  // Informação e comunicação
  "58": 2, "59": 2, "60": 2, "61": 1, "62": 1, "63": 1,
  // Financeiro / seguros
  "64": 1, "65": 1, "66": 1,
  // Imobiliário
  "68": 1,
  // Profissionais, científicas e técnicas
  "69": 1, "70": 1, "71": 2, "72": 2, "73": 1, "74": 2, "75": 2,
  // Administrativas e serviços complementares
  "77": 2, "78": 2, "79": 2, "80": 3, "81": 3, "82": 2,
  // Administração pública
  "84": 2,
  // Educação
  "85": 2,
  // Saúde humana e serviços sociais
  "86": 3, "87": 3, "88": 2,
  // Artes, cultura, esporte e recreação
  "90": 2, "91": 2, "92": 3, "93": 2,
  // Outras atividades de serviços
  "94": 2, "95": 3, "96": 3,
  // Serviços domésticos
  "97": 2,
  // Organismos internacionais
  "99": 1,
};

export interface GrauRiscoResult {
  grauRisco: number | null;
  /** CNAE usado na classificação (7 díg. quando disponível, senão a divisão). */
  cnaeSst: string | null;
}

/** Deriva o grau de risco (NR-4) a partir de um código CNAE. */
export function grauRiscoPorCnae(cnae: string | null | undefined): GrauRiscoResult {
  const d = onlyDigits(cnae);
  if (d.length < 2) return { grauRisco: null, cnaeSst: null };
  const divisao = d.slice(0, 2);
  const grau = GRAU_POR_DIVISAO[divisao] ?? null;
  return { grauRisco: grau, cnaeSst: d.length >= 7 ? d.slice(0, 7) : divisao };
}

/** Normaliza o "porte" da Receita para ME | EPP | DEMAIS (ou null). */
export function normalizePorte(porte: string | null | undefined): "ME" | "EPP" | "DEMAIS" | null {
  if (!porte) return null;
  const p = porte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  if (p.includes("MICRO") || p === "01" || p === "ME") return "ME";
  if (p.includes("PEQUENO") || p === "03" || p === "EPP") return "EPP";
  if (p.includes("DEMAIS") || p.includes("GRANDE") || p.includes("MEDIO") || p === "05") return "DEMAIS";
  return null;
}

/**
 * Limiares aproximados de obrigatoriedade de SESMT por nº de empregados no
 * estabelecimento, em função do grau de risco (baseado no Quadro II da NR-4).
 */
function sesmtPorContagem(grau: number, n: number): boolean {
  if (grau >= 4) return n >= 50;
  if (grau === 3) return n >= 100;
  return n >= 500; // grau 1–2
}

export interface SstInput {
  cnae?: string | null;
  porte?: string | null;
  numFuncionarios?: number | null;
}

export interface SstResult {
  grauRisco: number | null;
  cnaeSst: string | null;
  sesmtProvavel: boolean | null;
  rhEstruturadoProvavel: boolean | null;
}

/**
 * Deriva os indicadores de SST. Sem nº de funcionários (caso do v1 gratuito),
 * estima SESMT/RH pelo porte: empresas de grande porte ("DEMAIS") com grau de
 * risco médio/alto tendem a exigir SESMT e a ter RH estruturado.
 */
export function derivarSst({ cnae, porte, numFuncionarios }: SstInput): SstResult {
  const { grauRisco, cnaeSst } = grauRiscoPorCnae(cnae);
  const porteNorm = normalizePorte(porte);

  let sesmtProvavel: boolean | null = null;
  if (grauRisco != null) {
    if (typeof numFuncionarios === "number") {
      sesmtProvavel = sesmtPorContagem(grauRisco, numFuncionarios);
    } else if (porteNorm) {
      sesmtProvavel = porteNorm === "DEMAIS" && grauRisco >= 3;
    }
  }

  const rhEstruturadoProvavel = porteNorm ? porteNorm === "DEMAIS" : null;

  return { grauRisco, cnaeSst, sesmtProvavel, rhEstruturadoProvavel };
}
