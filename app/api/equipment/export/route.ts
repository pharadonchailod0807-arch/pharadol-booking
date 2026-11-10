import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import {
  authorizeEquipment,
  equipmentDb,
  equipmentFailure,
  inventoryQuery,
  limitEquipment,
} from "@/lib/equipment/server";
import { EquipmentError } from "@/lib/equipment/validation";
import {
  exportColumns,
  exportRows,
  equipmentPdfHtml,
} from "@/lib/equipment/export";
import type { Equipment } from "@/lib/equipment/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  let stage = "authorization";
  try {
    const { actor } = await authorizeEquipment(request);
    const limited = limitEquipment(actor);
    if (limited) return limited;
    const format = request.nextUrl.searchParams.get("format");
    if (!["xlsx", "pdf"].includes(format || ""))
      throw new EquipmentError("รองรับ Excel และ PDF เท่านั้น");
    stage = "inventory";
    const db = equipmentDb(),
      rows: Equipment[] = [];
    const limit = format === "pdf" ? 2000 : 10000;
    for (let from = 0; from <= limit; from += 500) {
      const { query } = inventoryQuery(db, request.nextUrl.searchParams);
      const r = await query.range(from, from + 499);
      if (r.error) throw r.error;
      rows.push(...((r.data || []) as Equipment[]));
      if ((r.count || 0) > limit)
        throw new EquipmentError(
          `ข้อมูลเกิน ${limit.toLocaleString()} รายการ กรุณาใช้ตัวกรองก่อน Export`,
        );
      if ((r.data || []).length < 500) break;
    }
    let bytes: Uint8Array;
    if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.aoa_to_sheet([
        exportColumns,
        ...exportRows(rows),
      ]);
      sheet["!cols"] = exportColumns.map((_, i) => ({
        wch: i === 1 || i === 2 ? 32 : 20,
      }));
      sheet["!autofilter"] = { ref: sheet["!ref"] || "A1:Q1" };
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Equipment");
      bytes = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
    } else {
      stage = "chromium";
      const puppeteer = (await import("puppeteer-core")).default;
      let browser;
      if (process.env.VERCEL_ENV) {
        const chromium = (await import("@sparticuz/chromium")).default;
        browser = await puppeteer.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: "shell",
        });
      } else {
        const local = (await import("puppeteer")).default;
        browser = await local.launch({
          headless: true,
          executablePath: [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium",
          ].find((candidate) => existsSync(candidate)),
        });
      }
      try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on("request", (req) =>
          req.url().startsWith("data:") ? req.continue() : req.abort(),
        );
        stage = "font";
        const font = await fs.readFile(
          path.join(process.cwd(), "public", "equipment", "NotoSansThai.ttf"),
        );
        stage = "render";
        await page.setContent(equipmentPdfHtml(rows, font.toString("base64")), {
          waitUntil: "load",
        });
        await page.evaluate(() => document.fonts.ready);
        bytes = await page.pdf({
          format: "A3",
          landscape: true,
          printBackground: true,
          margin: { top: "14mm", right: "10mm", bottom: "14mm", left: "10mm" },
        });
      } finally {
        await browser.close();
      }
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf",
        "Content-Disposition": `attachment; filename="pharadol-equipment.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    // Runtime diagnostics contain no inventory, session token, or credentials.
    if (["chromium", "font", "render"].includes(stage)) {
      const error = e as Error & { code?: string };
      console.error("Equipment PDF failed", {
        stage,
        name: error.name,
        code: error.code,
        message: String(error.message || "").replace(/https?:\/\/\S+/g, "[url]").slice(0, 800),
      });
    }
    return equipmentFailure(e);
  }
}
