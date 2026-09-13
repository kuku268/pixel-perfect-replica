// .pdf report (business tier) — pdfkit + an embedded Noto Sans TC subset
// (public/fonts/NotoSansTC-Regular.subset.otf, OFL) so Traditional Chinese
// renders on the server without system fonts. Layout follows the design
// canvas (artboard ⑥): green cover band, meta, summary, speakers, transcript.
//
// pdfkit reads its own font metrics from node_modules at runtime, so it is
// listed in next.config.mjs `serverExternalPackages` — do not bundle it.

import { readFileSync } from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import { formatClock, groupTurns, speakerName, speakersInUse, type Segment, type Speakers } from "@/lib/transcript";

import { docLang, formatDate, formatDuration, strings, type DocLang } from "./strings";

export type ReportInput = {
  title: string;
  createdAt: string;
  source: string;
  segments: Segment[];
  speakers: Speakers;
  summary: string | null;
  lang?: DocLang | string;
};

const FONT_PATH = path.join(process.cwd(), "public", "fonts", "NotoSansTC-Regular.subset.otf");
const GREEN = "#1F6B3A";
const GREY = "#6B7280";
const INK = "#111827";
const RULE = "#E5E7EB";

let fontBytes: Buffer | null = null;
function font(): Buffer {
  if (!fontBytes) fontBytes = readFileSync(FONT_PATH);
  return fontBytes;
}

export function buildReportPdf(input: ReportInput): Promise<Buffer> {
  const lang = docLang(input.lang);
  const t = strings(lang);
  const turns = groupTurns(input.segments);
  const duration = input.segments.reduce((m, s) => Math.max(m, s.end), 0);
  const attendeeIds = speakersInUse(input.segments);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 56, left: 50, right: 50 },
      info: { Title: `${t.reportTitle} — ${input.title}`, Author: "Video Speed Reader" },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("tc", font());
    doc.font("tc");

    const pageW = doc.page.width;
    const left = doc.page.margins.left;
    const contentW = pageW - left - doc.page.margins.right;

    // Cover band
    doc.rect(0, 0, pageW, 150).fill(GREEN);
    doc.fillColor("#FFFFFF").fontSize(11).text(t.generatedBy, left, 40);
    doc.fontSize(26).text(t.reportTitle, left, 62, { width: contentW });
    doc.fontSize(13).fillColor("#D1FAE5").text(input.title, left, 104, { width: contentW, ellipsis: true, height: 20 });

    // Meta
    doc.fillColor(INK).fontSize(10);
    let y = 175;
    const meta: [string, string][] = [
      [t.date, formatDate(input.createdAt, lang)],
      [t.duration, formatDuration(duration, lang)],
      [t.source, input.source],
    ];
    for (const [label, value] of meta) {
      doc.fillColor(GREY).text(label, left, y, { width: 80 });
      doc.fillColor(INK).text(value, left + 84, y, { width: contentW - 84 });
      y = Math.max(y + 16, doc.y + 4);
    }

    const section = (title: string) => {
      doc.moveDown(0.8);
      const sy = doc.y;
      doc.fillColor(GREEN).fontSize(14).text(title, left, sy);
      doc.moveTo(left, doc.y + 4).lineTo(left + contentW, doc.y + 4).strokeColor(RULE).lineWidth(1).stroke();
      doc.moveDown(0.6);
      doc.fillColor(INK).fontSize(10);
    };

    doc.y = y + 8;
    section(t.summary);
    if (input.summary) {
      for (const line of input.summary.split(/\n+/).filter((l) => l.trim())) {
        doc.text(line.replace(/^[-•*]\s*/, "• "), left, doc.y, { width: contentW, lineGap: 2 });
        doc.moveDown(0.3);
      }
    } else {
      doc.fillColor(GREY).text(t.noSummary, left, doc.y, { width: contentW }).fillColor(INK);
    }

    section(t.attendees);
    if (attendeeIds.length === 0) {
      doc.fillColor(GREY).text("—", left, doc.y).fillColor(INK);
    }
    let sx = left;
    const chipY = doc.y;
    for (const id of attendeeIds) {
      const name = speakerName(input.speakers, id);
      const color = input.speakers[id]?.color ?? "#64748B";
      const w = doc.widthOfString(name) + 22;
      if (sx + w > left + contentW) break;
      doc.circle(sx + 7, chipY + 6, 4).fill(color);
      doc.fillColor(INK).text(name, sx + 16, chipY, { lineBreak: false });
      sx += w + 10;
    }
    doc.y = chipY + 18;

    section(t.transcript);
    const timeW = 58;
    const spkW = 90;
    const textX = left + timeW + spkW;
    const textW = contentW - timeW - spkW;
    for (const turn of turns) {
      const name = speakerName(input.speakers, turn.speaker) || "—";
      const color = input.speakers[turn.speaker]?.color ?? GREY;
      const h = doc.heightOfString(turn.text, { width: textW, lineGap: 2 });
      if (doc.y + h + 12 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
      const rowY = doc.y;
      doc.fillColor(GREY).fontSize(9).text(formatClock(turn.start), left, rowY + 1, { width: timeW, lineBreak: false });
      doc.fillColor(color).fontSize(10).text(name, left + timeW, rowY, { width: spkW - 8, ellipsis: true, height: 14 });
      doc.fillColor(INK).fontSize(10).text(turn.text, textX, rowY, { width: textW, lineGap: 2 });
      doc.y = Math.max(doc.y, rowY + 14) + 6;
    }

    // Page numbers. Writing inside the bottom margin makes pdfkit open a new
    // page, so drop the margin to 0 on each page while stamping the footer.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fillColor(GREY)
        .fontSize(8)
        .text(`${t.page} ${i + 1} / ${range.count}`, left, doc.page.height - 36, { width: contentW, align: "right", lineBreak: false });
      doc.page.margins.bottom = savedBottom;
    }

    doc.end();
  });
}
