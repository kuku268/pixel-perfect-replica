"use client";

// UI strings for the /upload page, the download menu, the unlock dialog and
// the transcript editor — zh (Traditional, Taiwan) and en. The choice is kept
// in localStorage (`vsr.lang`) and toggled from the header ("EN｜中文").
// Document-internal labels (docx/pdf) live in src/lib/exports/strings.ts.

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "zh" | "en";

const DICT = {
  zh: {
    // header / page
    dashboard: "儀表板",
    h1: "轉錄影片",
    yours: "你的轉錄",
    noJobs: "還沒有轉錄。從下方送出第一部影片。",
    thCreated: "建立",
    thSource: "來源",
    thStatus: "狀態",
    thPlan: "方案",
    thDownloads: "下載",
    thSummary: "摘要",
    business: "商務版",
    standard: "標準版",
    justNow: "剛剛",
    minutesAgo: "{n} 分鐘前",
    hoursAgo: "{n} 小時前",
    daysAgo: "{n} 天前",
    stPending: "排隊中",
    stDownloading: "下載中",
    stTranscribe: "轉錄中",
    stDone: "完成",
    stInsufficient: "點數不足",
    stFailed: "失敗",
    failedWhy: "未扣點。原因：{reason}",
    // download menu
    download: "下載",
    plainText: "純文字",
    bizLabel: "商務版 · 講者識別",
    subsSpk: "字幕（含講者）",
    minutes: "會議紀錄",
    report: "報告書",
    speakersLocked: "講者識別未解鎖",
    unlockFor: "解鎖（{n} 點）",
    unlockNote: "重新處理音檔 · 約 2 分鐘 · 失敗不扣點",
    identifying: "辨識講者中…",
    unlockProgress: "下載中 → 轉錄中 · 完成才扣 {n} 點",
    add: "+ 加入",
    adding: "加入中…",
    openEditor: "檢視／編輯",
    reupload: "原始上傳檔已刪除，請以商務版重新上傳",
    // unlock dialog
    unlockTitle: "解鎖講者識別",
    unlockDesc: "為此逐字稿加上「誰說了什麼」。勾選需要的格式，之後也可再加。",
    video: "影片",
    duration: "時長",
    minutesN: "{n} 分鐘",
    cost: "費用",
    creditsN: "{n} 點",
    balanceAfter: "扣點後餘額",
    unlockLong: "音檔會以講者識別重新處理，約 2 分鐘。完成才扣點；失敗不扣。",
    formatsToGen: "要產生的格式",
    cancel: "取消",
    notEnough: "點數不足，需要 {n} 點。",
    buyCredits: "購買點數",
    // form
    newT: "新增轉錄",
    tabUpload: "上傳檔案",
    tabUrl: "貼網址",
    videoUrl: "影片網址",
    urlPh: "直接的 mp4 / mp3 網址（例如 CloudFront、Vimeo、Internet Archive）",
    ytNote: "不支援 YouTube 連結——雲端 IP 需要 cookie 驗證。",
    dropTitle: "把影片或音檔拖到這裡",
    or: "或",
    chooseFile: "選擇檔案",
    limits: "MP4、MOV、M4A、MP3、WAV · 單檔 2 GB 以內 · 直接上傳到安全儲存空間，不經過我們的伺服器",
    uploadNote: "音訊擷取完成後原始檔即刪除。仍不支援 YouTube 連結——請先下載影片再從這裡上傳。",
    uploading: "上傳中… {p}%",
    uploadProgress: "{done} / {total} · {speed} · 約剩 {eta}",
    keepOpen: "上傳完成前請勿關閉此頁；之後轉錄在雲端執行，可以離開。",
    uploaded: "{size} · 已上傳 · 按「開始轉錄」開始",
    replace: "更換檔案",
    uploadFailed: "上傳失敗：{reason}",
    leaveWarning: "檔案還在上傳中，離開會中斷上傳。",
    topic: "主題（選填）",
    topicPh: "例如：科技 podcast——給模型的辨識上下文",
    language: "語言",
    langAuto: "自動偵測（中英夾雜請選這個）",
    plan: "方案",
    stdPrice: "每分鐘 1 點",
    stdDesc: "純文字逐字稿，不含時間軸與講者。",
    bizPrice: "每分鐘 {n} 點",
    spkId: "講者識別",
    bizDesc: "誰說了什麼，附時間軸。適合會議與訪談。",
    deliverables: "產出格式（可複選）",
    expected: "預計講者人數",
    expectedHint: "（選填，可提高準確度）",
    notSure: "不確定",
    submit: "開始轉錄",
    submitting: "送出中…",
    consent1: "按下「開始轉錄」即表示你同意",
    terms: "《服務條款》",
    consent2: "：逐字稿一經成功生成，所扣點數不予退還；轉錄失敗不扣點。",
    insufficient: "你的點數不足。",
    networkError: "網路錯誤，請再試一次。",
    // editor
    transcript: "逐字稿",
    editorMeta: "{source} · {min} 分鐘 · {n} 位講者",
    speakers: "講者",
    lines: "{n} 段",
    renameHint: "點名稱即可改名——按 Enter 或點其他處，整份逐字稿一起套用。",
    reassignHint: "游標移到某一行按 1–9 可改指派講者；點講者名可改指派或合併。",
    basicNotice: "內建編輯器只提供基本修正；更完整的編輯請匯出檔案後於專業軟體進行。",
    reassignTo: "改指派給",
    mergeInto: "將 {name} 合併到…",
    playHint: "點時間碼跳播、雙擊可修改 · Space 播放/暫停 · 雙擊文字可修改",
    follow: "跟隨播放",
    editHint: "Enter 儲存 · Esc 取消",
    edited: "已修改",
    tsHint: "Enter 儲存 · [ 取播放位置",
    draftSaved: "草稿已儲存",
    unsaved: "有未儲存的修改",
    timeLeft: "還可修改 {d} 天 {h} 小時（至 {until}）",
    windowClosed: "編輯期限已過，仍可匯出",
    audioGone: "音檔已刪除，無法播放；逐字稿仍可匯出",
    retention: "匯出後音檔立即刪除，不再保留；影片檔一律不保留。",
    save: "儲存",
    saving: "儲存中…",
    exportDelete: "匯出並刪除音檔",
    exportOnly: "匯出",
    exportConfirmTitle: "匯出並刪除音檔？",
    exportConfirmDesc: "會下載你選的 {fmt} 檔，然後立即刪除保留的音檔。之後仍可匯出，但無法再播放或修改。",
    exportConfirmOk: "匯出並刪除",
    loadFailed: "載入失敗：{reason}",
    colorTitle: "換顏色",
    // toggle
    langToggleEn: "EN",
    langToggleZh: "中文",
    // summary cell
    summarize: "摘要",
    summarizing: "摘要中…",
    viewSummary: "查看",
    summaryTitle: "摘要",
    summaryDesc: "第一次產生後會保留，之後隨時免費查看。",
    requestFailed: "請求失敗（{n}）",
    networkError: "網路錯誤，請再試一次。",
    // credits badge
    badgeCredits: "點數",
    badgeBuyMore: "買更多",
    badgeTitle: "1 點 = 1 分鐘影片",
    // credits page
    navTranscribe: "轉錄影片",
    creditsH1: "點數",
    balanceLabel: "你的點數",
    balanceNote: "1 點 = 1 分鐘影片。每部影片以分鐘無條件進位；失敗的轉錄不扣點。",
    buyCredits: "購買點數",
    tierName: "{n} 點",
    perCredit: "每點 {p} · 可轉錄 {n} 分鐘影片",
    buyN: "購買 {n} 點",
    openingCheckout: "前往付款中…",
    checkoutFailed: "無法前往付款（{n}）",
    payNote: "由綠界金流處理付款，以新台幣計價。",
    payNoteTest: "測試模式：卡號 4311 9522 2222 2222，到期日填未來任一日，CVV 任意，簡訊驗證碼 1234。",
    paymentFailed: "付款未完成，沒有扣款也沒有加點。",
    history: "點數紀錄",
    noTx: "還沒有任何紀錄。",
    txPurchase: "購買",
    txDeduction: "扣點",
    txSignup: "贈點",
    txAdmin: "系統贈點",
    txUnlock: "解鎖",
    // purchase success
    paidH1: "付款成功",
    paidAdding: "點數入帳中…",
    paidReady: "點數已入帳。",
    currentBalance: "目前點數",
    goTranscribe: "轉錄影片",
    viewHistory: "查看紀錄",
  },
  en: {
    dashboard: "Dashboard",
    h1: "Transcribe a video",
    yours: "Your transcriptions",
    noJobs: "No transcriptions yet. Submit your first video below.",
    thCreated: "Created",
    thSource: "Source",
    thStatus: "Status",
    thPlan: "Plan",
    thDownloads: "Downloads",
    thSummary: "Summary",
    business: "Business",
    standard: "Standard",
    justNow: "just now",
    minutesAgo: "{n}m ago",
    hoursAgo: "{n}h ago",
    daysAgo: "{n}d ago",
    stPending: "pending",
    stDownloading: "downloading",
    stTranscribe: "transcribe",
    stDone: "done",
    stInsufficient: "insufficient credits",
    stFailed: "failed",
    failedWhy: "Not charged. Reason: {reason}",
    download: "Download",
    plainText: "Plain text",
    bizLabel: "Business · Speaker identification",
    subsSpk: "Subtitles with speakers",
    minutes: "Meeting minutes",
    report: "Report",
    speakersLocked: "Speakers locked",
    unlockFor: "Unlock for {n} credits",
    unlockNote: "Re-processes the audio · about 2 min · not charged if it fails",
    identifying: "Identifying speakers…",
    unlockProgress: "Downloading → transcribing · {n} credits charged on completion",
    add: "+ Add",
    adding: "Adding…",
    openEditor: "View / edit",
    reupload: "The uploaded original was deleted — upload it again as a Business job",
    unlockTitle: "Unlock speaker identification",
    unlockDesc: "Adds who-said-what to this transcript. Pick the formats you need — you can add more later.",
    video: "Video",
    duration: "Duration",
    minutesN: "{n} min",
    cost: "Cost",
    creditsN: "{n} credits",
    balanceAfter: "Balance after",
    unlockLong: "The audio is processed again with speaker identification — about 2 minutes. Credits are only charged when it completes; if it fails, you keep them.",
    formatsToGen: "Formats to generate",
    cancel: "Cancel",
    notEnough: "Not enough credits — this needs {n}.",
    buyCredits: "Buy credits",
    newT: "New transcription",
    tabUpload: "Upload a file",
    tabUrl: "Paste a URL",
    videoUrl: "Video URL",
    urlPh: "Direct mp4 / mp3 URL (e.g. CloudFront, Vimeo, Internet Archive)",
    ytNote: "YouTube links are not supported — they need cookie auth from cloud IPs.",
    dropTitle: "Drag a video or audio file here",
    or: "or",
    chooseFile: "choose a file",
    limits: "MP4, MOV, M4A, MP3, WAV · up to 2 GB · uploads straight to secure storage, never through our servers",
    uploadNote: "The original file is deleted as soon as the audio has been extracted. YouTube links are still not supported — download the video and upload it here instead.",
    uploading: "Uploading… {p}%",
    uploadProgress: "{done} of {total} · {speed} · about {eta} left",
    keepOpen: "Keep this page open until the upload finishes. Transcription then runs in the cloud — you can leave.",
    uploaded: "{size} · uploaded · press Transcribe to start",
    replace: "Replace",
    uploadFailed: "Upload failed: {reason}",
    leaveWarning: "A file is still uploading — leaving will cancel it.",
    topic: "Topic (optional)",
    topicPh: "e.g. Tech podcast — useful context for the model",
    language: "Language",
    langAuto: "Auto-detect (pick this for mixed zh/en)",
    plan: "Plan",
    stdPrice: "1 credit / min",
    stdDesc: "Plain text transcript, no timestamps or speakers.",
    bizPrice: "{n} credits / min",
    spkId: "Speaker identification",
    bizDesc: "Who said what, with timestamps. Best for meetings and interviews.",
    deliverables: "Deliverables (choose any)",
    expected: "Expected speakers",
    expectedHint: "(optional, improves accuracy)",
    notSure: "Not sure",
    submit: "Transcribe",
    submitting: "Submitting…",
    consent1: "By pressing Transcribe you agree to the ",
    terms: "Terms",
    consent2: ". Credits are non-refundable once a transcript has been generated; failed jobs are never charged.",
    insufficient: "You don't have enough credits.",
    networkError: "Network error — please try again.",
    transcript: "Transcript",
    editorMeta: "{source} · {min} min · {n} speakers",
    speakers: "Speakers",
    lines: "{n} lines",
    renameHint: "Click a name to rename it — Enter or click away applies it everywhere.",
    reassignHint: "Hover a line and press 1–9 to reassign it; click a speaker name to reassign or merge.",
    basicNotice: "The built-in editor covers basic fixes only; for fuller editing, export your files and continue in dedicated software.",
    reassignTo: "Reassign to",
    mergeInto: "Merge {name} into…",
    playHint: "Click a timestamp to seek, double-click to edit it · Space plays/pauses · double-click text to edit",
    follow: "Follow playback",
    editHint: "Enter saves · Esc cancels",
    edited: "edited",
    tsHint: "Enter saves · [ = playhead",
    draftSaved: "Draft saved",
    unsaved: "Unsaved changes",
    timeLeft: "{d} days {h} h left to edit (until {until})",
    windowClosed: "Edit window closed — exporting still works",
    audioGone: "Audio deleted — playback unavailable; exports still work",
    retention: "Exporting deletes the audio right away. Video files are never kept.",
    save: "Save",
    saving: "Saving…",
    exportDelete: "Export & delete audio",
    exportOnly: "Export",
    exportConfirmTitle: "Export and delete the audio?",
    exportConfirmDesc: "Downloads the {fmt} file, then deletes the kept audio immediately. You can still export later, but not play or edit.",
    exportConfirmOk: "Export & delete",
    loadFailed: "Could not load: {reason}",
    colorTitle: "Change colour",
    langToggleEn: "EN",
    langToggleZh: "中文",
    // summary cell
    summarize: "Summarize",
    summarizing: "Summarizing…",
    viewSummary: "View",
    summaryTitle: "Summary",
    summaryDesc: "Cached after first generation — open again any time at no cost.",
    requestFailed: "Request failed ({n})",
    networkError: "Network error — please try again.",
    // credits badge
    badgeCredits: "Credits",
    badgeBuyMore: "Buy more",
    badgeTitle: "1 credit = 1 minute of video",
    // credits page
    navTranscribe: "Transcribe",
    creditsH1: "Credits",
    balanceLabel: "Your balance",
    balanceNote: "1 credit = 1 minute of video. Rounded up per video; failed jobs are never charged.",
    buyCredits: "Buy credits",
    tierName: "{n} Credits",
    perCredit: "{p} per credit · {n} minutes of video",
    buyN: "Buy {n} credits",
    openingCheckout: "Opening checkout…",
    checkoutFailed: "Checkout failed ({n})",
    payNote: "Payments are processed securely by Stripe, in USD.",
    payNoteTest: "Test mode: use card 4242 4242 4242 4242, any future date, any CVC.",
    paymentFailed: "Payment was not completed — nothing was charged.",
    history: "History",
    noTx: "No transactions yet.",
    txPurchase: "Purchase",
    txDeduction: "Usage",
    txSignup: "Bonus",
    txAdmin: "Grant",
    txUnlock: "Unlock",
    // purchase success
    paidH1: "Payment received",
    paidAdding: "Adding your credits…",
    paidReady: "Your credits are ready.",
    currentBalance: "current balance",
    goTranscribe: "Transcribe a video",
    viewHistory: "View history",
  },
} as const;

export type Key = keyof (typeof DICT)["zh"];

const STORAGE_KEY = "vsr.lang";

function detect(): Lang {
  if (typeof window === "undefined") return "zh";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* private mode etc. */
  }
  // Taiwan-first product: Traditional Chinese unless the user toggled EN.
  return "zh";
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: "zh", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  // Render zh on the server and on first paint, then switch to the saved
  // preference after hydration so server and client markup match.
  const [lang, setLangState] = useState<Lang>("zh");
  useEffect(() => {
    setLangState(detect());
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return createElement(LangContext.Provider, { value }, children);
}

export function useLang() {
  return useContext(LangContext);
}

/** t("minutesAgo", { n: 5 }) → "5 分鐘前" */
export function useT() {
  const { lang } = useLang();
  return useCallback(
    (key: Key, vars?: Record<string, string | number>) => {
      let s: string = DICT[lang][key] ?? DICT.zh[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  const t = useT();
  const base = "whitespace-nowrap px-2 py-0.5 text-xs font-medium rounded-md transition-colors";
  return createElement(
    "div",
    { className: `inline-flex items-center rounded-lg border border-border bg-background/60 p-0.5 ${className}`, role: "group", "aria-label": "Language" },
    createElement(
      "button",
      { type: "button", onClick: () => setLang("en"), className: `${base} ${lang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}` },
      t("langToggleEn"),
    ),
    createElement(
      "button",
      { type: "button", onClick: () => setLang("zh"), className: `${base} ${lang === "zh" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}` },
      t("langToggleZh"),
    ),
  );
}
