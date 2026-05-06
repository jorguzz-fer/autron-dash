import Papa from "papaparse";

interface ReadCsvOptions {
  encoding?: "utf-8" | "latin1";
  delimiter?: string;
  skipLines?: number;
}

/** Lê um CSV bruto (Buffer) para array de objetos com header da linha N. */
export function readCsvRows(
  buffer: Buffer,
  { encoding = "latin1", delimiter = ";", skipLines = 0 }: ReadCsvOptions = {},
): Record<string, string>[] {
  const text = new TextDecoder(encoding).decode(buffer);
  const lines = skipLines > 0 ? text.split(/\r?\n/).slice(skipLines).join("\n") : text;
  const result = Papa.parse<Record<string, string>>(lines, {
    header: true,
    skipEmptyLines: true,
    delimiter,
  });
  return result.data;
}
