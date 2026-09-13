import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "Terms — Video Speed Reader",
  description: "Service terms: credits, audio retention, editing and accuracy.",
};

// Product-side terms (draft reviewed by KO 2026-09-12; have a lawyer review
// before public launch). Both languages on one page so the consent line under
// "Transcribe" can link here regardless of the UI language.

const ZH = [
  ["1. 點數扣除與退費", "按下「開始轉錄」後，系統即開始處理您提交的影音內容。逐字稿一經成功生成，該次所扣除之點數即不予退還。若轉錄失敗（包括來源無法下載、點數不足或系統錯誤），系統不會扣除點數。"],
  ["2. 音檔與影片檔之保留", "本服務不保留您提交的影片檔。商務版工作所產生之音訊檔僅供您在編輯期限內（逐字稿完成後 3 天）邊聽邊修正；您按下「匯出」或期限屆至時，音訊檔即永久刪除。逐字稿、講者名稱與您的修正內容則會保留。"],
  ["3. 編輯功能", "內建編輯器只提供基本修正；更完整的編輯請匯出檔案後於專業軟體進行。"],
  ["4. 辨識結果", "語音辨識與講者識別由自動化模型產生，可能存在錯誤；您應自行檢查並修正後再使用。"],
] as const;

const EN = [
  ["1. Credits and refunds", "Processing begins when you press Transcribe. Once a transcript has been successfully generated, the credits charged for that job are non-refundable. If a job fails (including source download failure, insufficient credits or a system error), no credits are charged."],
  ["2. Retention of audio and video", "We never keep the video file you submit. For Business jobs, the extracted audio is kept only so you can listen while editing, and only until you press Export or the editing window (3 days after the transcript is completed) ends — whichever comes first. The transcript, speaker names and your edits are kept."],
  ["3. Editing", "The built-in editor covers basic fixes only; for fuller editing, export your files and continue in dedicated software."],
  ["4. Accuracy", "Transcription and speaker identification are produced by automated models and may contain errors. Review and correct the output before relying on it."],
] as const;

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <BrandMark to="/" />
          <Link href="/upload" className="text-sm font-medium text-primary hover:underline">
            Upload
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">服務條款 · Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">最後更新 / Last updated: 2026-09-13</p>

        {[
          { title: "中文", items: ZH },
          { title: "English", items: EN },
        ].map((block) => (
          <section key={block.title} className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{block.title}</h2>
            <dl className="mt-4 space-y-5">
              {block.items.map(([heading, body]) => (
                <div key={heading}>
                  <dt className="font-semibold text-foreground">{heading}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-foreground/90">{body}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </main>
    </div>
  );
}
