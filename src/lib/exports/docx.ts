// .docx meeting minutes (business tier) — built with the `docx` package, no
// Word on the server. Layout follows the design canvas (artboard ⑤):
// title, info table, summary, then a time / speaker / content table with one
// row per speaker turn.

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { formatClock, groupTurns, speakerName, speakersInUse, type Segment, type Speakers } from "@/lib/transcript";

import { docLang, formatDate, formatDuration, strings, type DocLang } from "./strings";

export type MinutesInput = {
  title: string;
  createdAt: string;
  source: string;
  segments: Segment[];
  speakers: Speakers;
  summary: string | null;
  lang?: DocLang | string;
};

// East Asian text needs an eastAsia font; Latin falls back to Calibri. Word
// substitutes PingFang / Noto on machines without JhengHei.
const FONT = { ascii: "Calibri", hAnsi: "Calibri", cs: "Calibri", eastAsia: "Microsoft JhengHei" };
const GREEN = "1F6B3A";
const GREY = "6B7280";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function text(value: string, opts: { bold?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({ text: value, bold: opts.bold, color: opts.color, size: opts.size, font: FONT });
}

// Widths are in DXA (1/20 pt); A4 minus the 2 cm margins ≈ 9640 DXA. Word
// honours cell widths, LibreOffice needs the Table's columnWidths too.
const PAGE_DXA = 9640;
const INFO_COLS = [2200, PAGE_DXA - 2200];
const ROW_COLS = [1300, 1750, PAGE_DXA - 1300 - 1750];

function cell(children: Paragraph[], opts: { width: number; shade?: string }) {
  return new TableCell({
    children,
    width: { size: opts.width, type: WidthType.DXA },
    borders: BORDERS,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    ...(opts.shade ? { shading: { type: ShadingType.CLEAR, fill: opts.shade, color: "auto" } } : {}),
  });
}

function infoRow(label: string, value: string) {
  return new TableRow({
    children: [
      cell([new Paragraph({ children: [text(label, { bold: true, color: GREY })] })], { width: INFO_COLS[0], shade: "F3F4F6" }),
      cell([new Paragraph({ children: [text(value)] })], { width: INFO_COLS[1] }),
    ],
  });
}

export async function buildMinutesDocx(input: MinutesInput): Promise<Buffer> {
  const lang = docLang(input.lang);
  const t = strings(lang);
  const turns = groupTurns(input.segments);
  const duration = input.segments.reduce((m, s) => Math.max(m, s.end), 0);
  const attendees = speakersInUse(input.segments).map((id) => speakerName(input.speakers, id));

  const header = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [text(t.minutesTitle, { bold: true, color: GREEN, size: 40 })],
      spacing: { after: 60 },
    }),
    new Paragraph({ children: [text(input.title, { size: 24, color: GREY })], spacing: { after: 240 } }),
    new Table({
      width: { size: PAGE_DXA, type: WidthType.DXA },
      columnWidths: INFO_COLS,
      rows: [
        infoRow(t.date, formatDate(input.createdAt, lang)),
        infoRow(t.duration, formatDuration(duration, lang)),
        infoRow(t.attendees, attendees.join(lang === "zh" ? "、" : ", ") || "—"),
        infoRow(t.source, input.source),
      ],
    }),
    new Paragraph({ spacing: { after: 200 }, children: [] }),
  ];

  const summary = [
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [text(t.summary, { bold: true, color: GREEN })] }),
    ...(input.summary
      ? input.summary
          .split(/\n+/)
          .filter((line) => line.trim())
          .map((line) => new Paragraph({ children: [text(line.replace(/^[-•*]\s*/, "• "))], spacing: { after: 80 } }))
      : [new Paragraph({ children: [text(t.noSummary, { color: GREY })] })]),
    new Paragraph({ spacing: { after: 200 }, children: [] }),
  ];

  const transcriptHeader = new TableRow({
    tableHeader: true,
    children: [
      cell([new Paragraph({ children: [text(t.time, { bold: true })] })], { width: ROW_COLS[0], shade: "E8F3EC" }),
      cell([new Paragraph({ children: [text(t.speaker, { bold: true })] })], { width: ROW_COLS[1], shade: "E8F3EC" }),
      cell([new Paragraph({ children: [text(t.content, { bold: true })] })], { width: ROW_COLS[2], shade: "E8F3EC" }),
    ],
  });

  const rows = turns.map(
    (turn) =>
      new TableRow({
        children: [
          cell([new Paragraph({ children: [text(formatClock(turn.start), { color: GREY })] })], { width: ROW_COLS[0] }),
          cell([new Paragraph({ children: [text(speakerName(input.speakers, turn.speaker) || "—", { bold: true })] })], {
            width: ROW_COLS[1],
          }),
          cell([new Paragraph({ children: [text(turn.text)] })], { width: ROW_COLS[2] }),
        ],
      }),
  );

  const transcript = [
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [text(t.transcript, { bold: true, color: GREEN })] }),
    new Table({ width: { size: PAGE_DXA, type: WidthType.DXA }, columnWidths: ROW_COLS, rows: [transcriptHeader, ...rows] }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 240 },
      children: [text(t.generatedBy, { color: GREY, size: 16 })],
    }),
  ];

  const doc = new Document({
    creator: "Video Speed Reader",
    title: `${t.minutesTitle} — ${input.title}`,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: [...header, ...summary, ...transcript],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
