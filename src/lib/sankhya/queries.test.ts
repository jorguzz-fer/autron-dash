import { describe, expect, it } from "vitest";
import { parseSankhyaDate } from "./queries";

describe("parseSankhyaDate", () => {
  it("formato ISO do DbExplorer (com e sem hora)", () => {
    expect(parseSankhyaDate("2026-08-31 00:00:00.0")).toEqual(new Date(Date.UTC(2026, 7, 31)));
    expect(parseSankhyaDate("2026-08-05")).toEqual(new Date(Date.UTC(2026, 7, 5)));
    expect(parseSankhyaDate("2026-08-05T14:03:22")).toEqual(
      new Date(Date.UTC(2026, 7, 5, 14, 3, 22)),
    );
  });

  it("formato dd/mm/yyyy", () => {
    expect(parseSankhyaDate("31/08/2026")).toEqual(new Date(Date.UTC(2026, 7, 31)));
    expect(parseSankhyaDate("05/08/2026 14:03:22")).toEqual(
      new Date(Date.UTC(2026, 7, 5, 14, 3, 22)),
    );
  });

  it("formato ddmmyyyy do loadRecords", () => {
    expect(parseSankhyaDate("31082026 00:00:00")).toEqual(new Date(Date.UTC(2026, 7, 31)));
    expect(parseSankhyaDate("05082026")).toEqual(new Date(Date.UTC(2026, 7, 5)));
  });

  it("vazio/inválido → null", () => {
    expect(parseSankhyaDate(null)).toBeNull();
    expect(parseSankhyaDate(undefined)).toBeNull();
    expect(parseSankhyaDate("")).toBeNull();
    expect(parseSankhyaDate("não é data")).toBeNull();
  });
});
