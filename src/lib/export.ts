import "server-only";
import ExcelJS from "exceljs";
import { format } from "date-fns";

function asDate(value: unknown): Date | null {
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface ExportColumn {
  key: string;
  header: string;
  type?: "text" | "number" | "money" | "percent" | "date" | "shares";
  width?: number;
}

export interface ExportSheet {
  name: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  title?: string;
  subtitle?: string;
}

function cell(value: unknown, type: ExportColumn["type"]) {
  if (value === null || value === undefined) return "";
  if (type === "date") {
    const d = asDate(value);
    return d ? format(d, "yyyy-MM-dd") : "";
  }
  if (type === "percent" && typeof value === "number") return `${(value * 100).toFixed(4)}%`;
  return value;
}

export function toCsv(sheet: ExportSheet): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [sheet.columns.map((c) => esc(c.header)).join(",")];
  for (const r of sheet.rows) lines.push(sheet.columns.map((c) => esc(cell(r[c.key], c.type))).join(","));
  return lines.join("\n");
}

export async function toXlsx(sheets: ExportSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Capt";
  wb.created = new Date();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    let rowIdx = 1;
    if (sheet.title) {
      ws.getCell(rowIdx, 1).value = sheet.title;
      ws.getCell(rowIdx, 1).font = { bold: true, size: 14 };
      rowIdx++;
      if (sheet.subtitle) {
        ws.getCell(rowIdx, 1).value = sheet.subtitle;
        ws.getCell(rowIdx, 1).font = { color: { argb: "FF667085" } };
        rowIdx++;
      }
      rowIdx++;
    }
    const headerRow = ws.getRow(rowIdx);
    sheet.columns.forEach((c, i) => {
      const hc = headerRow.getCell(i + 1);
      hc.value = c.header;
      hc.font = { bold: true };
      hc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F2F4" } };
      hc.border = { bottom: { style: "thin", color: { argb: "FFD0D5DD" } } };
      ws.getColumn(i + 1).width = c.width ?? Math.max(12, Math.min(48, c.header.length + 6));
    });
    rowIdx++;
    for (const r of sheet.rows) {
      const row = ws.getRow(rowIdx++);
      sheet.columns.forEach((c, i) => {
        const v = r[c.key];
        const target = row.getCell(i + 1);
        if (v === null || v === undefined) {
          target.value = "";
          return;
        }
        if (c.type === "date") {
          // ExcelJS serialises dates in UTC, so pin the local calendar date to UTC midnight.
          const d = asDate(v);
          target.value = d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : "";
          target.numFmt = "yyyy-mm-dd";
        } else if (c.type === "money") {
          target.value = Number(v);
          target.numFmt = '"$"#,##0.00##';
        } else if (c.type === "percent") {
          target.value = Number(v);
          target.numFmt = "0.00%";
        } else if (c.type === "shares" || c.type === "number") {
          target.value = Number(v);
          target.numFmt = c.type === "shares" ? "#,##0" : "#,##0.####";
        } else {
          target.value = v as ExcelJS.CellValue;
        }
      });
    }
    ws.views = [{ state: "frozen", ySplit: rowIdx - sheet.rows.length - 1 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export function csvResponse(sheet: ExportSheet, filename: string) {
  return new Response(toCsv(sheet), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.csv"` },
  });
}

export async function xlsxResponse(sheets: ExportSheet[], filename: string) {
  const buf = await toXlsx(sheets);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}.xlsx"` },
  });
}
