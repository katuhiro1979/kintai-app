// このファイルは app.jsx から自動生成されています。直接編集しないでください。
// 編集する場合は app.jsx を直し、`node build.js` で再生成してください。
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// 出勤簿 アプリ本体(ソース)。
// ここを編集したら、そのままでは動きません。build.js で app.js にコンパイルしてから使ってください
// (README.md の「ソースを編集した場合」を参照)。ブラウザでのBabel実行時変換はやめました。
const {
  useState,
  useEffect,
  useRef,
  useCallback
} = React;

/* ---------- helpers ---------- */
const pad = n => String(n).padStart(2, "0");
const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const todayObj = () => {
  const n = new Date();
  return {
    y: n.getFullYear(),
    m: n.getMonth() + 1,
    d: n.getDate()
  };
};
const hmNow = () => {
  const n = new Date();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
};
const toMinutes = hm => {
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const minutesToLabel = mins => {
  if (mins == null) return "―";
  const sign = mins < 0 ? "-" : "";
  mins = Math.abs(Math.round(mins));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${sign}${h}時間${pad(m)}分`;
};
const breakMinutesFor = worked => {
  if (worked > 480) return 60;
  if (worked > 360) return 45;
  return 0;
};
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
const weekdayLabel = (y, m, d) => ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, d).getDay()];
const isWeekend = (y, m, d) => {
  const w = new Date(y, m - 1, d).getDay();
  return w === 0 || w === 6;
};
const monthLabel = m => ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"][m - 1];
const DEFAULT_WORK_TYPE_OPTIONS = ["", "保守", "泊", "明", "M1", "M2", "N朝", "NX", "C", "MA", "MX", "中継", "休日", "法定", "有給"];
const DEFAULT_HOLIDAY_TYPES = ["休日", "法定"];
const DEFAULT_AUTO_FILL_TIMES = {
  "泊": ["19:00", "02:30"],
  "明": ["02:30", "09:30"],
  "保守": ["09:30", "17:30"],
  "M1": ["09:30", "17:30"],
  "N朝": ["09:30", "17:30"],
  "MX": ["09:30", "17:30"],
  "NX": ["11:00", "19:00"],
  "C": ["11:00", "19:00"],
  "M2": ["11:00", "19:00"]
};
const SPECIAL_STANDARD_HOURS = 7.5;
const DEFAULT_SPECIAL_TYPES = [...Object.keys(DEFAULT_AUTO_FILL_TIMES), "中継"];
const LEAVE_COUNT_START = "2026-01-01";
const DEFAULT_SETTINGS = {
  standardHours: 8,
  paidLeaveTotal: 20
};

// 保存キーをこのページの場所(パス)ごとに分ける。file:// で複数のバージョンを同じブラウザで
// 開いても、互いのデータを上書きしないようにするため(以前は固定キーで共有されていた)。
// http(s) で配信する場合も、配置場所が変わればキーも変わる。
const scopeKey = name => {
  try {
    return `${name}::${location.pathname}`;
  } catch (e) {
    return name;
  }
};
const STORAGE_KEY = scopeKey("kintai-data-v1");
const BACKUP_KEY = scopeKey("kintai-backups-v1"); // 世代バックアップの一覧
const CORRUPT_KEY = scopeKey("kintai-data-v1-corrupt"); // 読み込みに失敗した保存データの退避先
const SYNC_KEY = scopeKey("kintai-sync-v1"); // クラウドと最後に同期した時点の記録 { hash, at }
const BACKUP_KEEP_DAYS = 7;
const BACKUP_MAX_COUNT = 30;
const CLOUD_SYNC_DELAY_MS = 5000; // 編集が止まってからクラウドへ送るまでの待ち時間

// 文字列の簡易ハッシュ(同期済みかどうかの比較用。暗号用途ではない)
const hashStr = s => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0;
  return `${s.length}:${h}`;
};
const NIGHT_NOTE = "泊"; // 「泊」の翌日は「明」になる勤務パターン
const AFTER_NIGHT_NOTE = "明";
const BULK_CLEAR = "__clear__"; // 一括入力で「空にする」を選んだときの値
// 時間外の上限(36協定の一般的な基準)。上限の LIMIT_WARN_RATIO 以上で注意、超えたら超過として表示する
const LIMIT_MONTH_OT_HOURS = 45;
const LIMIT_MONTH_TOTAL_HOURS = 100; // 時間外+休日労働(月100時間未満)
const LIMIT_YEAR_OT_HOURS = 360;
const LIMIT_WARN_RATIO = 0.8;

// minimal CSV line splitter (no quoted-comma support needed for our simple sheets)
const parseCsvText = text => {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.length > 0);
  return lines.map(l => l.split(","));
};
const normalizeTimeStr = s => {
  s = (s || "").trim();
  if (!s) return "";
  if (s.includes(":")) {
    const [h, m] = s.split(":");
    if (/^\d+$/.test(h) && /^\d+$/.test(m)) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    return s;
  }
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  if (/^\d{1,2}$/.test(s)) return `${String(s).padStart(2, "0")}:00`;
  return s;
};

// 日付文字列を YYYY-MM-DD に揃える(2026-9-19 / 2026/9/19 / 2026.9.19 に対応)。解釈できなければ空文字。
const normalizeDateStr = s => {
  const m = (s || "").trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  return m ? dateKey(Number(m[1]), Number(m[2]), Number(m[3])) : "";
};

// CSVを文字コード自動判定で読み込む(UTF-8で読めなければShift-JIS)。BOMは取り除く。
const readCsvText = (file, onText) => {
  const reader = new FileReader();
  reader.onload = ev => {
    const buf = ev.target.result;
    let text;
    try {
      text = new TextDecoder("utf-8", {
        fatal: true
      }).decode(buf);
    } catch (e) {
      text = new TextDecoder("shift_jis").decode(buf);
    }
    onText(text.replace(/^﻿/, ""));
  };
  reader.readAsArrayBuffer(file);
};

// Persist the File System Access API handle in IndexedDB so it survives page reloads.
// (showSaveFilePicker's handle only lives in memory otherwise, forcing the user to
// re-pick a save location every time the page refreshes.) DB名もページの場所ごとに分ける。
const fileHandleStore = {
  DB_NAME: scopeKey("kintai-file-handles"),
  STORE_NAME: "handles",
  KEY: "export-handle",
  _openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async save(handle) {
    try {
      const db = await this._openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readwrite");
        tx.objectStore(this.STORE_NAME).put(handle, this.KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      // IndexedDB unavailable — the handle just won't survive a reload
    }
  },
  async load() {
    try {
      const db = await this._openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readonly");
        const req = tx.objectStore(this.STORE_NAME).get(this.KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }
};
const storageAdapter = {
  async get(key) {
    if (window.storage && typeof window.storage.get === "function") {
      try {
        const res = await window.storage.get(key, false);
        if (res) return res;
      } catch (e) {
        // fall through to localStorage
      }
    }
    try {
      const v = localStorage.getItem(key);
      return v ? {
        value: v
      } : null;
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    if (window.storage && typeof window.storage.set === "function") {
      try {
        await window.storage.set(key, value, false);
        return true;
      } catch (e) {
        // fall through to localStorage
      }
    }
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      // storage unavailable (e.g. private browsing) — 保存できなかったことを呼び出し側へ返す
      return false;
    }
  }
};
const downloadJsonFile = (data, filename) => {
  const blob = new Blob([data], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// YYYY-MM-DD の日付キーを delta 日ずらす(月をまたいでもよい)
const shiftDateKey = (key, delta) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
};
const limitLevelOf = (mins, limitHours) => {
  const ratio = mins / (limitHours * 60);
  return ratio > 1 ? "over" : ratio >= LIMIT_WARN_RATIO ? "warn" : "ok";
};

// 上限に対する進み具合を、数値とバーで表示する
function LimitMeter({
  label,
  mins,
  limitHours
}) {
  const level = limitLevelOf(mins, limitHours);
  const ratio = mins / (limitHours * 60);
  return /*#__PURE__*/React.createElement("div", {
    className: "k-limit-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-limit-head"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", {
    className: `k-limit-val k-limit-${level}`
  }, level === "over" ? "⚠ 超過 " : level === "warn" ? "⚠ " : "", minutesToLabel(mins), " / ", limitHours, "\u6642\u9593")), /*#__PURE__*/React.createElement("div", {
    className: "k-limit-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: `k-limit-fill k-limit-${level}`,
    style: {
      width: `${Math.min(100, ratio * 100)}%`
    }
  })));
}
function KintaiApp() {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [records, setRecords] = useState({}); // dateKey -> {clockIn, clockOut, isLeave, note, remark, otStart, otEnd, locked}
  const [memo, setMemo] = useState("");
  const [workTypeOptions, setWorkTypeOptions] = useState(DEFAULT_WORK_TYPE_OPTIONS);
  const [autoFillTimes, setAutoFillTimes] = useState(DEFAULT_AUTO_FILL_TIMES);
  const [holidayTypes, setHolidayTypes] = useState(DEFAULT_HOLIDAY_TYPES);
  const [specialTypes, setSpecialTypes] = useState(DEFAULT_SPECIAL_TYPES);
  const workTypeFileRef = useRef(null);
  const ledgerCsvFileRef = useRef(null);
  const [view, setView] = useState(() => {
    const t = todayObj();
    return {
      y: t.y,
      m: t.m
    };
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [showMemo, setShowMemo] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importPromptDismissed, setImportPromptDismissed] = useState(false);
  const [leavePickDate, setLeavePickDate] = useState("");
  const [clock, setClock] = useState(hmNow());
  const [zoom, setZoom] = useState(1);
  const saveTimer = useRef(null);
  const fileInputRef = useRef(null);
  const fileHandleRef = useRef(null);
  const [needsFilePermission, setNeedsFilePermission] = useState(false);
  const [savedFileName, setSavedFileName] = useState("");
  const [backups, setBackups] = useState([]); // [{ at, day, reason, data }] 新しい順
  const [loadError, setLoadError] = useState(false); // 保存データの読み込みに失敗したら自動保存を止める
  const backupsRef = useRef([]);
  const lastFileDataRef = useRef(""); // 最後にファイルへ書き込んだ内容(変わっていなければ書き込まない)
  const rootRef = useRef(null);
  const [saveState, setSaveState] = useState(""); // "" | "saving" | "saved" | "error"
  const [savedAt, setSavedAt] = useState(""); // ブラウザ内への最終保存時刻
  const [fileSavedAt, setFileSavedAt] = useState(""); // JSONファイルへの最終保存時刻
  // ---- クラウド同期(Supabase) ----
  const cloud = window.kintaiCloud;
  const cloudOn = !!(cloud && cloud.enabled);
  const [cloudUser, setCloudUser] = useState(null); // ログイン中のメールアドレス
  const [cloudStatus, setCloudStatus] = useState("");
  const [showCloud, setShowCloud] = useState(false);
  const [cloudConflict, setCloudConflict] = useState(null); // 端末とクラウドの両方が変更されたとき { value, updated_at }
  const [cloudForm, setCloudForm] = useState({
    email: "",
    password: ""
  });
  const [cloudMsg, setCloudMsg] = useState("");
  const dataRef = useRef(null); // 最新の保存対象データ
  const cloudMetaRef = useRef({
    hash: null,
    at: null
  });
  const cloudBusyRef = useRef(false);
  const cloudAgainRef = useRef(false); // 同期中に再度依頼されたら、終了後にもう一度行う
  const cloudConflictRef = useRef(null);
  const cloudTimer = useRef(null);
  const cloudUserRef = useRef(null);
  const syncNowRef = useRef(null);
  const [bulkMode, setBulkMode] = useState(false); // 一括入力パネルの表示
  const [bulkSel, setBulkSel] = useState({}); // 一括入力で選択中の日 (dateKey -> true)
  const [bulkNote, setBulkNote] = useState(""); // 一括入力する業務内容("" は未選択)
  const [bulkAddAfter, setBulkAddAfter] = useState(true); // 「泊」を入れた翌日に「明」も入れる
  const [bulkMsg, setBulkMsg] = useState("");
  const [suggestion, setSuggestion] = useState(null); // 「泊」の翌日を「明」にする提案 { key, note }

  const today = todayObj();
  const todayKey = dateKey(today.y, today.m, today.d);

  // 世代バックアップを1件追加する。直近BACKUP_KEEP_DAYS日分だけ残す。
  // oncePerDay が true なら、同じ日・同じ理由のバックアップが既にあれば何もしない。
  const addBackup = async (reason, data, oncePerDay = false) => {
    const t = todayObj();
    const day = dateKey(t.y, t.m, t.d);
    const list = backupsRef.current;
    if (oncePerDay && list.some(b => b.day === day && b.reason === reason)) return;
    const limit = new Date();
    limit.setDate(limit.getDate() - BACKUP_KEEP_DAYS);
    const oldest = dateKey(limit.getFullYear(), limit.getMonth() + 1, limit.getDate());
    const next = [{
      at: `${day} ${hmNow()}`,
      day,
      reason,
      data
    }, ...list].filter(b => b.day >= oldest).slice(0, BACKUP_MAX_COUNT);
    backupsRef.current = next;
    setBackups(next);
    await storageAdapter.set(BACKUP_KEY, JSON.stringify(next));
  };
  useEffect(() => {
    const id = setInterval(() => setClock(hmNow()), 1000 * 15);
    return () => clearInterval(id);
  }, []);

  // 提案は一定時間で自動的に閉じる
  useEffect(() => {
    if (!suggestion) return;
    const id = setTimeout(() => setSuggestion(null), 12000);
    return () => clearTimeout(id);
  }, [suggestion]);

  // 起動時に今日の行が見える位置までスクロールする
  useEffect(() => {
    if (!loaded) return;
    const el = document.getElementById(`row-${todayKey}`);
    if (!el) return;
    const wrap = el.closest(".k-table-wrap");
    if (wrap && wrap.scrollHeight > wrap.clientHeight) {
      // PC: 表の中だけをスクロールする(ページ全体は動かさない)
      wrap.scrollTop = el.offsetTop - wrap.clientHeight / 2 + el.offsetHeight / 2;
    } else {
      // スマホ: 表が縦に伸びているので、ページ全体をスクロールする
      el.scrollIntoView({
        block: "center"
      });
    }
  }, [loaded]);

  // Ctrl+ホイールで画面をズームする。ReactのonWheelはpassiveでpreventDefaultが効かず、
  // ブラウザ標準のズームと二重に効いてしまうため、passive:falseで直接登録する。
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(z => {
        const next = z + (e.deltaY < 0 ? 0.1 : -0.1);
        return Math.min(1.6, Math.max(0.7, Math.round(next * 100) / 100));
      });
    };
    el.addEventListener("wheel", onWheel, {
      passive: false
    });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loaded]);
  useEffect(() => {
    (async () => {
      let raw = null;
      try {
        // バックアップ一覧は、最初の自動保存で上書きしてしまわないよう先に読み込む
        try {
          const bk = await storageAdapter.get(BACKUP_KEY);
          const list = bk && bk.value ? JSON.parse(bk.value) : [];
          if (Array.isArray(list)) {
            backupsRef.current = list;
            setBackups(list);
          }
        } catch (e) {
          // バックアップ一覧が壊れていても本体の読み込みは続ける
        }
        const res = await storageAdapter.get(STORAGE_KEY);
        if (res && res.value) {
          raw = res.value;
          const parsed = JSON.parse(raw);
          setSettings({
            ...DEFAULT_SETTINGS,
            ...(parsed.settings || {})
          });
          setRecords(parsed.records || {});
          setMemo(parsed.memo || "");
          if (parsed.workTypeOptions) setWorkTypeOptions(parsed.workTypeOptions);
          if (parsed.autoFillTimes) setAutoFillTimes(parsed.autoFillTimes);
          if (parsed.holidayTypes) setHolidayTypes(parsed.holidayTypes);
          if (parsed.specialTypes) setSpecialTypes(parsed.specialTypes);
        }
      } catch (e) {
        // 壊れたデータを空データで上書きしないよう、別キーへ退避して自動保存を止める
        setLoadError(true);
        if (raw != null) {
          try {
            await storageAdapter.set(CORRUPT_KEY, raw);
          } catch (e2) {/* 退避に失敗しても続行 */}
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);
  useEffect(() => {
    if (!loaded || loadError) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const json = JSON.stringify({
          settings,
          records,
          memo,
          workTypeOptions,
          autoFillTimes,
          holidayTypes,
          specialTypes
        });
        const ok = await storageAdapter.set(STORAGE_KEY, json);
        if (!ok) {
          setSaveState("error");
          return;
        }
        setSavedAt(hmNow());
        setSaveState("saved");
        // 1日1回、その日の最初の保存内容(=前日までの状態)を世代バックアップとして残す
        if (Object.keys(records).length) await addBackup("自動", json, true);
        // ログイン中なら、編集が落ち着いてからクラウドへ送る
        if (cloudUserRef.current) {
          clearTimeout(cloudTimer.current);
          cloudTimer.current = setTimeout(() => syncNowRef.current && syncNowRef.current(), CLOUD_SYNC_DELAY_MS);
        }
      } catch (e) {
        setSaveState("error");
        console.error("保存に失敗しました", e);
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [settings, records, memo, workTypeOptions, autoFillTimes, holidayTypes, specialTypes, loaded, loadError]);
  dataRef.current = {
    settings,
    records,
    memo,
    workTypeOptions,
    autoFillTimes,
    holidayTypes,
    specialTypes
  };
  cloudUserRef.current = cloudUser;
  cloudConflictRef.current = cloudConflict;
  const saveCloudMeta = async (hash, at) => {
    cloudMetaRef.current = {
      hash,
      at
    };
    await storageAdapter.set(SYNC_KEY, JSON.stringify({
      hash,
      at
    }));
  };

  // クラウドのデータをこの端末へ反映する。上書きされる端末側データは、先に世代バックアップへ退避する。
  const applyRemote = async remote => {
    const parsed = JSON.parse(remote.value);
    const cur = dataRef.current;
    if (Object.keys(cur.records).length) await addBackup("同期前", JSON.stringify(cur));
    const next = {
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings || {})
      },
      records: parsed.records || {},
      memo: parsed.memo || "",
      workTypeOptions: parsed.workTypeOptions || cur.workTypeOptions,
      autoFillTimes: parsed.autoFillTimes || cur.autoFillTimes,
      holidayTypes: parsed.holidayTypes || cur.holidayTypes,
      specialTypes: parsed.specialTypes || cur.specialTypes
    };
    // 反映後に自動保存が書き出す内容と同じ形で「同期済み」を記録する(往復で更新し合わないため)
    await saveCloudMeta(hashStr(JSON.stringify(next)), remote.updated_at);
    setSettings(next.settings);
    setRecords(next.records);
    setMemo(next.memo);
    setWorkTypeOptions(next.workTypeOptions);
    setAutoFillTimes(next.autoFillTimes);
    setHolidayTypes(next.holidayTypes);
    setSpecialTypes(next.specialTypes);
  };

  // 端末とクラウドを突き合わせる。どちらか一方だけ変わっていれば自動で反映し、
  // 両方変わっていた場合は上書きせず、ユーザーに選んでもらう。
  const syncNow = async (attempt = 0) => {
    if (!cloudOn || !cloudUserRef.current || !loaded || loadError || cloudConflictRef.current) return;
    if (cloudBusyRef.current) {
      cloudAgainRef.current = true;
      return;
    }
    cloudBusyRef.current = true;
    let retry = false;
    try {
      setCloudStatus("☁ 同期中…");
      const {
        data: remote,
        error
      } = await cloud.pull();
      if (error) throw error;
      const cur = dataRef.current;
      const localJson = JSON.stringify(cur);
      const localHash = hashStr(localJson);
      const hasLocal = Object.keys(cur.records).length > 0;
      const meta = cloudMetaRef.current;
      const pushLocal = async expectedAt => {
        const res = await cloud.push(localJson, expectedAt);
        if (res.error) throw res.error;
        if (res.conflict) {
          retry = true;
          return;
        }
        await saveCloudMeta(localHash, res.updatedAt);
      };
      if (!remote) {
        if (hasLocal) await pushLocal(null); // クラウドが空のときだけ初回アップロード
      } else if (hashStr(remote.value) === localHash) {
        await saveCloudMeta(localHash, remote.updated_at);
      } else if (!hasLocal) {
        await applyRemote(remote); // この端末が空なら、クラウドを取り込む
      } else {
        const localChanged = localHash !== meta.hash;
        const remoteChanged = remote.updated_at !== meta.at;
        if (!localChanged && remoteChanged) await applyRemote(remote);else if (localChanged && !remoteChanged) await pushLocal(remote.updated_at);else if (localChanged && remoteChanged) setCloudConflict(remote);
      }
      if (!retry) setCloudStatus(`☁ 同期済み ${hmNow()}`);
    } catch (e) {
      console.error("クラウド同期に失敗しました", e);
      setCloudStatus("☁ 同期できません(オフライン?端末内には保存されています)");
    } finally {
      cloudBusyRef.current = false;
    }
    if (retry && attempt < 2 || cloudAgainRef.current) {
      cloudAgainRef.current = false;
      await syncNow(retry ? attempt + 1 : 0);
    }
  };
  syncNowRef.current = syncNow;

  // 競合時の選択: クラウドを採用(この端末のデータはバックアップへ退避)
  const resolveConflictWithCloud = async () => {
    const remote = cloudConflict;
    setCloudConflict(null);
    cloudConflictRef.current = null;
    try {
      await applyRemote(remote);
      setCloudStatus(`☁ クラウドの内容を反映しました ${hmNow()}`);
    } catch (e) {
      setCloudStatus("☁ クラウドのデータを読み込めませんでした");
    }
  };
  // 競合時の選択: この端末を採用(クラウドの内容はバックアップへ退避してから上書き)
  const resolveConflictWithLocal = async () => {
    const remote = cloudConflict;
    setCloudConflict(null);
    cloudConflictRef.current = null;
    await addBackup("同期前(クラウド)", remote.value);
    const json = JSON.stringify(dataRef.current);
    const res = await cloud.push(json, remote.updated_at);
    if (res.updatedAt) {
      await saveCloudMeta(hashStr(json), res.updatedAt);
      setCloudStatus(`☁ この端末の内容を送信しました ${hmNow()}`);
    } else syncNow();
  };

  // 起動時: 同期記録とログイン状態を読み込み、ログイン状態の変化を監視する
  useEffect(() => {
    if (!cloudOn) return;
    let unsub = () => {};
    (async () => {
      try {
        const m = await storageAdapter.get(SYNC_KEY);
        if (m && m.value) cloudMetaRef.current = {
          ...cloudMetaRef.current,
          ...JSON.parse(m.value)
        };
      } catch (e) {/* 記録が壊れていたら未同期として扱う(競合時は確認が出る) */}
      setCloudUser(await cloud.getUserEmail());
      unsub = cloud.onChange(email => setCloudUser(email));
    })();
    return () => unsub();
  }, []);

  // 読み込み完了後・ログイン直後・画面に戻ったとき・オンライン復帰時に同期する
  useEffect(() => {
    if (!cloudOn || !loaded || loadError || !cloudUser) return;
    syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    const onOnline = () => syncNow();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [loaded, loadError, cloudUser]);
  const cloudSignIn = async signUp => {
    setCloudMsg("");
    const {
      email,
      password
    } = cloudForm;
    const res = signUp ? await cloud.signUp(email, password) : await cloud.signIn(email, password);
    if (res.error) setCloudMsg(res.error.message);else if (signUp) setCloudMsg("登録しました。確認メールが届いた場合はリンクを開いてからログインしてください。");else setCloudForm({
      email: "",
      password: ""
    });
  };
  const settingsRef = useRef(settings);
  const recordsRef = useRef(records);
  const memoRef = useRef(memo);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);
  useEffect(() => {
    memoRef.current = memo;
  }, [memo]);

  // restore a previously chosen save-file handle so "JSON保存" keeps overwriting
  // the same file across page reloads, instead of asking to pick it again every time
  useEffect(() => {
    if (!window.showSaveFilePicker) return;
    (async () => {
      const handle = await fileHandleStore.load();
      if (!handle) return;
      try {
        const perm = await handle.queryPermission({
          mode: "readwrite"
        });
        if (perm === "granted") {
          fileHandleRef.current = handle;
          setSavedFileName(handle.name || "");
        } else {
          // permission needs a user gesture to re-grant, but the file itself
          // doesn't need to be re-picked — offer a one-click re-grant instead
          fileHandleRef.current = handle;
          setSavedFileName(handle.name || "");
          setNeedsFilePermission(true);
        }
      } catch (e) {
        // handle is stale/unusable — fall back to picking a new file next time
      }
    })();
  }, []);
  const reauthorizeFile = async () => {
    if (!fileHandleRef.current) return;
    try {
      const perm = await fileHandleRef.current.requestPermission({
        mode: "readwrite"
      });
      if (perm === "granted") setNeedsFilePermission(false);
    } catch (e) {
      // user declined — leave the banner up so they can try again
    }
  };
  useEffect(() => {
    if (!loaded || loadError) return;
    const id = setInterval(async () => {
      if (!fileHandleRef.current) return;
      // 記録が空のときは書き込まない(リセットや読み込み失敗で、ファイル側のバックアップまで空にしないため)
      if (!Object.keys(recordsRef.current).length) return;
      const data = JSON.stringify({
        settings: settingsRef.current,
        records: recordsRef.current,
        memo: memoRef.current,
        workTypeOptions,
        autoFillTimes,
        holidayTypes,
        specialTypes
      }, null, 2);
      // 前回書き込んだ内容から変わっていなければ書き込まない
      if (data === lastFileDataRef.current) return;
      try {
        const writable = await fileHandleRef.current.createWritable();
        await writable.write(data);
        await writable.close();
        lastFileDataRef.current = data;
        setFileSavedAt(hmNow());
      } catch (e) {
        setNeedsFilePermission(true);
      }
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [loaded, loadError, workTypeOptions, autoFillTimes, holidayTypes, specialTypes]);
  const updateRecord = useCallback((key, patch) => {
    setRecords(prev => {
      const current = prev[key] || {
        clockIn: null,
        clockOut: null,
        isLeave: false,
        note: "",
        remark: "",
        otStart: null,
        otEnd: null,
        locked: false
      };
      if (current.locked && !("locked" in patch)) return prev; // day is locked; ignore edits
      return {
        ...prev,
        [key]: {
          ...current,
          ...patch
        }
      };
    });
  }, []);
  const standardHoursFor = rec => {
    const note = rec.note || "";
    if (holidayTypes.includes(note)) return 0;
    if (specialTypes.includes(note)) return SPECIAL_STANDARD_HOURS;
    return settings.standardHours;
  };
  const autoOvertimeMinutesFor = rec => {
    if (!rec || rec.isLeave) return 0;
    const inM = toMinutes(rec.clockIn);
    let outM = toMinutes(rec.clockOut);
    if (inM == null || outM == null) return 0;
    if (outM <= inM) outM += 24 * 60;
    const worked = outM - inM - breakMinutesFor(outM - inM);
    return Math.max(0, worked - standardHoursFor(rec) * 60);
  };
  const overtimeMinutesFor = rec => {
    if (!rec || rec.isLeave) return 0;
    if (rec.otStart && rec.otEnd) {
      const s = toMinutes(rec.otStart);
      let e = toMinutes(rec.otEnd);
      if (s != null && e != null) {
        if (e <= s) e += 24 * 60;
        return Math.max(0, e - s);
      }
    }
    return autoOvertimeMinutesFor(rec);
  };
  const dim = daysInMonth(view.y, view.m);
  const dayList = Array.from({
    length: dim
  }, (_, i) => i + 1);
  let monthOvertime = 0; // 時間外労働(法定休日の労働は含めない)
  let monthStatutoryWork = 0; // 法定休日労働
  let monthWorkDays = 0;
  let monthHolidays = 0;
  let monthStatutoryHolidays = 0;
  let monthLeaveDays = 0;
  dayList.forEach(d => {
    const rec = records[dateKey(view.y, view.m, d)];
    if (!rec) return;
    if (rec.note === "法定") monthStatutoryWork += overtimeMinutesFor(rec);else monthOvertime += overtimeMinutesFor(rec);
    if (rec.clockIn && rec.clockOut && !rec.isLeave) monthWorkDays += 1;
    if (rec.note === "休日") monthHolidays += 1;
    if (rec.note === "法定") monthStatutoryHolidays += 1;
    if (rec.isLeave) monthLeaveDays += 1;
  });

  // 表示中の年の時間外労働(法定休日の労働は除く)
  let yearOvertime = 0;
  Object.keys(records).forEach(k => {
    if (!k.startsWith(`${view.y}-`) || records[k].note === "法定") return;
    yearOvertime += overtimeMinutesFor(records[k]);
  });
  const limitChecks = [{
    label: "今月の時間外労働",
    mins: monthOvertime,
    limitHours: LIMIT_MONTH_OT_HOURS
  }, {
    label: "今月の時間外+休日労働",
    mins: monthOvertime + monthStatutoryWork,
    limitHours: LIMIT_MONTH_TOTAL_HOURS
  }, {
    label: `${view.y}年の時間外労働`,
    mins: yearOvertime,
    limitHours: LIMIT_YEAR_OT_HOURS
  }];
  const limitAlerts = limitChecks.filter(c => limitLevelOf(c.mins, c.limitHours) !== "ok");
  const allLeaveDatesSorted = Object.keys(records).filter(k => records[k].isLeave && k >= LEAVE_COUNT_START).sort();
  const leaveDatesThisYear = Object.keys(records).filter(k => records[k].isLeave && k.startsWith(`${view.y}-`)).sort();
  const leavesThisYear = leaveDatesThisYear.length;
  const leaveRemaining = settings.paidLeaveTotal - leavesThisYear;
  const isEmpty = Object.keys(records).length === 0;
  const changeMonth = delta => {
    let m = view.m + delta;
    let y = view.y;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setView({
      y,
      m
    });
    setBulkSel({}); // 別の月の選択が残らないようにする
    setBulkMsg("");
  };

  // 今日の月へ戻り、今日の行へ移動する
  const goToday = () => {
    if (view.y !== today.y || view.m !== today.m) {
      setView({
        y: today.y,
        m: today.m
      });
      setBulkSel({});
      setBulkMsg("");
    }
    setTimeout(() => jumpToDate(todayKey), 100);
  };

  // カレンダー(月の見出し)まで戻る
  const backToCalendar = () => {
    // ミニカレンダーの上端へ移動する。スマホでは月の見出しが上部に固定されるので、その高さ分を引く
    const el = document.getElementById("k-mini-cal");
    if (!el) return;
    const head = document.getElementById("k-calendar-top");
    const stuck = head && getComputedStyle(head).position === "sticky" ? head.offsetHeight : 0;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - stuck,
      behavior: "smooth"
    });
  };

  // カレンダーが画面の上に隠れたら「カレンダーに戻る」を表示する
  const [calHidden, setCalHidden] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const el = document.getElementById("k-mini-cal");
      setCalHidden(!!el && el.getBoundingClientRect().bottom < 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, {
      passive: true
    });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const jumpToDate = key => {
    const el = document.getElementById(`row-${key}`);
    if (!el) return;
    el.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    el.classList.add("k-row-flash");
    setTimeout(() => el.classList.remove("k-row-flash"), 1200);
  };
  const onNoteChange = (key, val) => {
    const patch = {
      note: val,
      remark: val,
      isLeave: val === "有給"
    };
    if (val in autoFillTimes) {
      const [ci, co] = autoFillTimes[val];
      patch.clockIn = ci;
      patch.clockOut = co;
    } else if (val === "" || holidayTypes.includes(val) || val === "有給" || val === "中継") {
      patch.clockIn = null;
      patch.clockOut = null;
    }
    updateRecord(key, patch);
  };
  const toggleLeave = (key, isLeave) => {
    if (isLeave) updateRecord(key, {
      isLeave: true,
      clockIn: null,
      clockOut: null,
      note: "有給",
      remark: "有給"
    });else updateRecord(key, {
      isLeave: false,
      note: "",
      remark: ""
    });
  };
  const toggleDayLock = key => {
    const current = records[key] || {
      locked: false
    };
    updateRecord(key, {
      locked: !current.locked
    });
  };
  const addLeave = () => {
    if (!leavePickDate) return;
    updateRecord(leavePickDate, {
      isLeave: true,
      clockIn: null,
      clockOut: null,
      note: "有給",
      remark: "有給"
    });
    setLeavePickDate("");
  };

  // 現在時刻を今日の出勤/退勤として記録する
  const punch = field => {
    const label = field === "clockIn" ? "出勤" : "退勤";
    const rec = records[todayKey] || {};
    if (rec.locked) {
      alert("今日の行はロック中です。");
      return;
    }
    if (rec.isLeave) {
      alert("今日は有給として登録されています。");
      return;
    }
    const now = hmNow();
    if (rec[field] && !window.confirm(`すでに${label}が ${rec[field]} で入力されています。${now} に上書きしますか？`)) return;
    updateRecord(todayKey, {
      [field]: now
    });
    // 別の月を表示中なら今月へ戻し、入力結果が見えるように今日の行へ移動する
    if (view.y !== today.y || view.m !== today.m) setView({
      y: today.y,
      m: today.m
    });
    setTimeout(() => jumpToDate(todayKey), 100);
  };

  // 破壊的な操作(リセット・インポート・復元)の直前に、現在の内容を退避する。
  // 記録が空なら失うものが無いので何もしない。
  const backupNow = reason => {
    if (!Object.keys(records).length) return;
    addBackup(reason, JSON.stringify({
      settings,
      records,
      memo,
      workTypeOptions,
      autoFillTimes,
      holidayTypes,
      specialTypes
    }));
  };

  // ---- 一括入力 ----
  const monthPrefix = `${view.y}-${pad(view.m)}-`;
  const selectedKeys = Object.keys(bulkSel).filter(k => bulkSel[k] && k.startsWith(monthPrefix)).sort();
  const toggleBulkMode = () => {
    setBulkMode(on => !on);
    setBulkSel({});
    setBulkMsg("");
  };
  const toggleSelect = key => {
    setBulkSel(prev => {
      const next = {
        ...prev
      };
      if (next[key]) delete next[key];else next[key] = true;
      return next;
    });
  };

  // 条件に合う日(日付の数字で判定)を選択に加える
  const selectDays = pred => {
    const next = {
      ...bulkSel
    };
    dayList.forEach(d => {
      if (pred(d)) next[dateKey(view.y, view.m, d)] = true;
    });
    setBulkSel(next);
  };

  // 選択した日に、選んだ業務内容をまとめて入力する(ロック中の日は飛ばす)
  const applyBulk = () => {
    if (!bulkNote || !selectedKeys.length) return;
    const note = bulkNote === BULK_CLEAR ? "" : bulkNote;
    const targets = selectedKeys.filter(k => !(records[k] || {}).locked);
    const lockedCount = selectedKeys.length - targets.length;
    // すでに入力のある日(出退勤や別の業務内容)を上書きする場合は確認する
    const overwriting = targets.filter(k => {
      const r = records[k] || {};
      return r.note && r.note !== note || r.clockIn || r.clockOut;
    });
    if (overwriting.length && !window.confirm(`入力済みの ${overwriting.length}日 を上書きします。よろしいですか？`)) return;
    backupNow("一括入力前");
    let afterCount = 0;
    targets.forEach(key => {
      onNoteChange(key, note);
      if (note !== NIGHT_NOTE || !bulkAddAfter || !workTypeOptions.includes(AFTER_NIGHT_NOTE)) return;
      // 「泊」の翌日が未入力・ロックなし・選択外のときだけ「明」を入れる
      const nextKey = shiftDateKey(key, 1);
      const next = records[nextKey] || {};
      if (bulkSel[nextKey] || next.locked || next.note) return;
      onNoteChange(nextKey, AFTER_NIGHT_NOTE);
      afterCount += 1;
    });
    setBulkMsg(`${targets.length}日に「${note || "空"}」を入力しました。` + (afterCount ? `翌日の「${AFTER_NIGHT_NOTE}」を${afterCount}日入力しました。` : "") + (lockedCount ? `ロック中の${lockedCount}日は飛ばしました。` : ""));
    setBulkSel({});
  };

  // 前月の同じ日付の業務内容を、今月の未入力の日へコピーする(出退勤時刻は業務内容の自動入力に従う)
  const prevMonth = view.m === 1 ? 12 : view.m - 1;
  const prevYear = view.m === 1 ? view.y - 1 : view.y;
  const copyPrevMonth = () => {
    const prevDim = daysInMonth(prevYear, prevMonth);
    const targets = [];
    dayList.forEach(d => {
      if (d > prevDim) return;
      const key = dateKey(view.y, view.m, d);
      const cur = records[key] || {};
      if (cur.locked || cur.note || cur.clockIn || cur.clockOut) return; // 入力済み・ロック中は上書きしない
      const src = records[dateKey(prevYear, prevMonth, d)];
      if (!src || !src.note || src.note === "有給") return; // 有給は前月のものをコピーしない
      targets.push([key, src.note]);
    });
    if (!targets.length) {
      setBulkMsg("コピーできる日がありません(前月に業務内容の入力が無いか、今月がすでに入力済みです)。");
      return;
    }
    if (!window.confirm(`${prevYear}年${prevMonth}月の業務内容を、${view.m}月の未入力の日 ${targets.length}日にコピーします。よろしいですか？`)) return;
    backupNow("前月コピー前");
    targets.forEach(([key, note]) => onNoteChange(key, note));
    setBulkMsg(`${prevMonth}月のパターンを${targets.length}日分コピーしました。`);
  };

  // 表の業務内容を「泊」にしたとき、翌日が未入力なら「明」にする提案を出す
  const suggestAfterNight = (key, val) => {
    const next = records[shiftDateKey(key, 1)] || {};
    if (val !== NIGHT_NOTE || !workTypeOptions.includes(AFTER_NIGHT_NOTE) || next.locked || next.note) {
      setSuggestion(null);
      return;
    }
    setSuggestion({
      key: shiftDateKey(key, 1),
      note: AFTER_NIGHT_NOTE
    });
  };
  const acceptSuggestion = () => {
    if (!suggestion) return;
    onNoteChange(suggestion.key, suggestion.note);
    setSuggestion(null);
  };
  const resetAllData = () => {
    backupNow("リセット前");
    setRecords({});
    setConfirmReset(false);
  };
  const handleExport = async () => {
    const data = JSON.stringify({
      settings,
      records,
      memo,
      workTypeOptions,
      autoFillTimes,
      holidayTypes,
      specialTypes
    }, null, 2);
    try {
      if (window.showSaveFilePicker) {
        if (!fileHandleRef.current || needsFilePermission) {
          fileHandleRef.current = await window.showSaveFilePicker({
            suggestedName: `kintai-data-${todayKey}.json`,
            types: [{
              description: "JSON",
              accept: {
                "application/json": [".json"]
              }
            }]
          });
          await fileHandleStore.save(fileHandleRef.current);
          setSavedFileName(fileHandleRef.current.name || "");
          setNeedsFilePermission(false);
        }
        const writable = await fileHandleRef.current.createWritable();
        await writable.write(data);
        await writable.close();
        lastFileDataRef.current = data;
        setFileSavedAt(hmNow());
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      fileHandleRef.current = null;
    }
    downloadJsonFile(data, `kintai-data-${todayKey}.json`);
  };

  // JSONの内容を画面の状態へ反映する(インポート・バックアップ復元で共通)
  const applyData = parsed => {
    setSettings({
      ...DEFAULT_SETTINGS,
      ...(parsed.settings || {})
    });
    setRecords(parsed.records || {});
    setMemo(parsed.memo || "");
    if (parsed.workTypeOptions) setWorkTypeOptions(parsed.workTypeOptions);
    if (parsed.autoFillTimes) setAutoFillTimes(parsed.autoFillTimes);
    if (parsed.holidayTypes) setHolidayTypes(parsed.holidayTypes);
    if (parsed.specialTypes) setSpecialTypes(parsed.specialTypes);
    setLoadError(false); // 正しいデータが入ったので自動保存を再開する
  };
  const handleImportFile = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed || typeof parsed !== "object") throw new Error("invalid");
        backupNow("インポート前");
        applyData(parsed);
      } catch (err) {
        alert("ファイルの読み込みに失敗しました。正しいJSONファイルか確認してください。");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  const restoreBackup = b => {
    if (!window.confirm(`${b.at}(${b.reason})の状態に復元します。現在の内容は「復元前」として退避されます。よろしいですか？`)) return;
    try {
      const parsed = JSON.parse(b.data);
      backupNow("復元前");
      applyData(parsed);
    } catch (err) {
      alert("バックアップの復元に失敗しました。");
    }
  };

  // 業務内容,出勤,退勤,作業時間(または区分) の列を持つCSVから、業務内容の自動入力ルールを
  // 完全に同期する(CSVに無い項目は選択肢から削除される)。技術戦略部勤務.csv等と同じ考え方。
  const handleWorkTypeCsv = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    readCsvText(file, text => {
      try {
        const rows = parseCsvText(text);
        if (!rows.length) throw new Error("空のファイルです");
        const header = rows[0].map(c => c.trim());
        const noteIdx = header.indexOf("業務内容");
        if (noteIdx === -1) throw new Error("「業務内容」列が見つかりません");
        const inIdx = header.indexOf("出勤");
        const outIdx = header.indexOf("退勤");
        const kindIdx = header.indexOf("区分");
        const workHoursIdx = header.indexOf("作業時間");
        const HOLIDAY_HINTS = ["休日", "法定", "祝日"];
        const options = [];
        const newAutoFill = {};
        const newHoliday = new Set();
        const newSpecial = new Set();
        const seen = new Set();
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const note = (row[noteIdx] || "").trim();
          if (!note) continue;
          if (!seen.has(note)) {
            seen.add(note);
            options.push(note);
          }
          const ci = inIdx >= 0 ? normalizeTimeStr(row[inIdx]) : "";
          const co = outIdx >= 0 ? normalizeTimeStr(row[outIdx]) : "";
          if (ci && co) newAutoFill[note] = [ci, co];
          if (HOLIDAY_HINTS.includes(note)) {
            newHoliday.add(note);
            continue;
          }
          if (kindIdx >= 0) {
            const kind = (row[kindIdx] || "").trim();
            if (HOLIDAY_HINTS.includes(kind)) newHoliday.add(note);else if (kind === "特別" || kind === "特") newSpecial.add(note);
          } else if (workHoursIdx >= 0) {
            if ((row[workHoursIdx] || "").trim()) newSpecial.add(note);
          }
        }
        if (!options.length) throw new Error("取り込めるデータが見つかりませんでした");
        const removed = workTypeOptions.filter(v => v && !options.includes(v));
        setWorkTypeOptions(["", ...options]);
        setAutoFillTimes(newAutoFill);
        setHolidayTypes([...newHoliday]);
        setSpecialTypes([...newSpecial]);
        alert(`業務内容の設定を更新しました。\n項目数: ${options.length}\n削除された項目: ${removed.join("、") || "なし"}`);
      } catch (err) {
        alert("CSVの読み込みに失敗しました: " + err.message);
      }
    });
    e.target.value = "";
  };

  // 日付,業務内容,出勤,退勤,作業時間,備考 の列を持つCSVから、日々の出勤簿データを取り込む。
  // 「作業時間」列は自動計算されるため参考情報として無視する。
  const handleLedgerCsv = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    readCsvText(file, text => {
      try {
        const rows = parseCsvText(text);
        if (!rows.length) throw new Error("空のファイルです");
        const header = rows[0].map(c => c.trim());
        const dateIdx = header.indexOf("日付");
        if (dateIdx === -1) throw new Error("「日付」列が見つかりません");
        const noteIdx = header.indexOf("業務内容");
        const inIdx = header.indexOf("出勤");
        const outIdx = header.indexOf("退勤");
        const remarkIdx = header.indexOf("備考");
        let count = 0;
        setRecords(prev => {
          const next = {
            ...prev
          };
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const dateStr = normalizeDateStr(row[dateIdx]);
            if (!dateStr) continue;
            const note = noteIdx >= 0 ? (row[noteIdx] || "").trim() : "";
            const ci = inIdx >= 0 ? normalizeTimeStr(row[inIdx]) : "";
            const co = outIdx >= 0 ? normalizeTimeStr(row[outIdx]) : "";
            const remark = remarkIdx >= 0 ? (row[remarkIdx] || "").trim() : "";
            const current = next[dateStr] || {
              clockIn: null,
              clockOut: null,
              isLeave: false,
              note: "",
              remark: "",
              otStart: null,
              otEnd: null,
              locked: false
            };
            if (current.locked) continue;
            const patch = {};
            if (note) {
              patch.note = note;
              patch.remark = remark || note;
              patch.isLeave = note === "有給"; // 画面で選んだときと同じく、有給は有給日数に数える
              if (patch.isLeave) {
                patch.clockIn = null;
                patch.clockOut = null;
              }
            } else if (remark) patch.remark = remark;
            if (ci) patch.clockIn = ci;
            if (co) patch.clockOut = co;
            if (note in autoFillTimes && !ci && !co) {
              const [aci, aco] = autoFillTimes[note];
              patch.clockIn = aci;
              patch.clockOut = aco;
            }
            if (Object.keys(patch).length) {
              next[dateStr] = {
                ...current,
                ...patch
              };
              count += 1;
            }
          }
          return next;
        });
        setTimeout(() => alert(`${count}日分のデータを取り込みました。`), 0);
      } catch (err) {
        alert("CSVの読み込みに失敗しました: " + err.message);
      }
    });
    e.target.value = "";
  };
  if (!loaded) {
    return /*#__PURE__*/React.createElement("div", {
      className: "kintai-root kintai-loading"
    }, "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026");
  }
  const todayRec = records[todayKey] || {};
  const saveLabel = loadError ? "自動保存: 停止中" : saveState === "saving" ? "保存中…" : saveState === "error" ? "⚠ 保存に失敗しました" : saveState === "saved" ? `✓ 保存しました ${savedAt}` : "";
  const saveStatusText = saveLabel + (fileSavedAt && !loadError ? `／ ファイル ${fileSavedAt}` : "");
  return /*#__PURE__*/React.createElement("div", {
    ref: rootRef,
    className: "kintai-root",
    style: {
      zoom: zoom
    }
  }, /*#__PURE__*/React.createElement("input", {
    ref: fileInputRef,
    type: "file",
    accept: "application/json",
    style: {
      display: "none"
    },
    onChange: handleImportFile
  }), /*#__PURE__*/React.createElement("input", {
    ref: workTypeFileRef,
    type: "file",
    accept: ".csv,text/csv",
    style: {
      display: "none"
    },
    onChange: handleWorkTypeCsv
  }), /*#__PURE__*/React.createElement("input", {
    ref: ledgerCsvFileRef,
    type: "file",
    accept: ".csv,text/csv",
    style: {
      display: "none"
    },
    onChange: handleLedgerCsv
  }), /*#__PURE__*/React.createElement("header", {
    className: "k-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-header-left"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k-eyebrow"
  }, "\u500B\u4EBA\u52E4\u6020\u8A18\u9332"), /*#__PURE__*/React.createElement("h1", null, "\u51FA\u52E4\u7C3F")), /*#__PURE__*/React.createElement("div", {
    className: "k-header-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-header-btn-row"
  }, cloudOn && /*#__PURE__*/React.createElement("button", {
    className: "k-header-export",
    onClick: () => setShowCloud(v => !v)
  }, "\u2601 ", cloudUser ? "同期" : "ログイン"), /*#__PURE__*/React.createElement("button", {
    className: "k-header-export",
    onClick: handleExport
  }, "\u2B07 JSON\u4FDD\u5B58"), /*#__PURE__*/React.createElement("button", {
    className: "k-header-export",
    onClick: () => fileInputRef.current && fileInputRef.current.click()
  }, "\u2B06 \u30C7\u30FC\u30BF\u3092\u30A4\u30F3\u30DD\u30FC\u30C8")), /*#__PURE__*/React.createElement("div", {
    className: "k-clock"
  }, clock), /*#__PURE__*/React.createElement("div", {
    className: "k-date"
  }, today.y, "\u5E74", today.m, "\u6708", today.d, "\u65E5\uFF08", weekdayLabel(today.y, today.m, today.d), "\uFF09"), /*#__PURE__*/React.createElement("div", {
    className: "k-punch-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-punch-btn k-punch-in",
    onClick: () => punch("clockIn"),
    title: "\u73FE\u5728\u6642\u523B\u3092\u4ECA\u65E5\u306E\u51FA\u52E4\u306B\u5165\u529B"
  }, "\u51FA\u52E4", todayRec.clockIn ? ` ${todayRec.clockIn}` : ""), /*#__PURE__*/React.createElement("button", {
    className: "k-punch-btn k-punch-out",
    onClick: () => punch("clockOut"),
    title: "\u73FE\u5728\u6642\u523B\u3092\u4ECA\u65E5\u306E\u9000\u52E4\u306B\u5165\u529B"
  }, "\u9000\u52E4", todayRec.clockOut ? ` ${todayRec.clockOut}` : "")), /*#__PURE__*/React.createElement("div", {
    className: `k-save-status ${saveState === "error" || loadError ? "k-save-status-error" : ""}`
  }, saveStatusText), cloudOn && cloudUser && cloudStatus && /*#__PURE__*/React.createElement("div", {
    className: "k-save-status"
  }, cloudStatus))), cloudOn && showCloud && /*#__PURE__*/React.createElement("div", {
    className: "k-cloud-panel"
  }, cloudUser ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", null, "\u30ED\u30B0\u30A4\u30F3\u4E2D: ", cloudUser), /*#__PURE__*/React.createElement("div", {
    className: "k-import-banner-buttons"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    onClick: () => syncNow()
  }, "\u4ECA\u3059\u3050\u540C\u671F"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: () => {
      cloud.signOut();
      setCloudStatus("");
    }
  }, "\u30ED\u30B0\u30A2\u30A6\u30C8"))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", null, "\u30ED\u30B0\u30A4\u30F3\u3059\u308B\u3068\u3001PC\u3068\u30B9\u30DE\u30DB\u3067\u30C7\u30FC\u30BF\u304C\u540C\u671F\u3055\u308C\u307E\u3059(\u30C7\u30FC\u30BF\u306F\u7AEF\u672B\u5185\u306B\u3082\u4FDD\u5B58\u3055\u308C\u307E\u3059)\u3002"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    placeholder: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9",
    value: cloudForm.email,
    onChange: e => setCloudForm({
      ...cloudForm,
      email: e.target.value
    })
  }), /*#__PURE__*/React.createElement("input", {
    type: "password",
    placeholder: "\u30D1\u30B9\u30EF\u30FC\u30C9(6\u6587\u5B57\u4EE5\u4E0A)",
    value: cloudForm.password,
    onChange: e => setCloudForm({
      ...cloudForm,
      password: e.target.value
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "k-import-banner-buttons"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    onClick: () => cloudSignIn(false)
  }, "\u30ED\u30B0\u30A4\u30F3"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: () => cloudSignIn(true)
  }, "\u65B0\u898F\u767B\u9332")), cloudMsg && /*#__PURE__*/React.createElement("span", {
    className: "k-cloud-msg"
  }, cloudMsg))), cloudConflict && /*#__PURE__*/React.createElement("div", {
    className: "k-import-banner"
  }, /*#__PURE__*/React.createElement("span", null, "\u3053\u306E\u7AEF\u672B\u3068\u30AF\u30E9\u30A6\u30C9\u306E\u4E21\u65B9\u3067\u30C7\u30FC\u30BF\u304C\u5909\u66F4\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u3069\u3061\u3089\u3092\u4F7F\u3044\u307E\u3059\u304B?(\u9078\u3070\u306A\u304B\u3063\u305F\u65B9\u306F\u3001\u8A2D\u5B9A\u306E\u300C\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u300D\u306B\u9000\u907F\u3055\u308C\u307E\u3059)"), /*#__PURE__*/React.createElement("div", {
    className: "k-import-banner-buttons"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    onClick: resolveConflictWithCloud
  }, "\u30AF\u30E9\u30A6\u30C9\u306E\u5185\u5BB9\u3092\u4F7F\u3046"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: resolveConflictWithLocal
  }, "\u3053\u306E\u7AEF\u672B\u306E\u5185\u5BB9\u3092\u4F7F\u3046"))), loadError && /*#__PURE__*/React.createElement("div", {
    className: "k-import-banner"
  }, /*#__PURE__*/React.createElement("span", null, "\u4FDD\u5B58\u30C7\u30FC\u30BF\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u305F\u305F\u3081\u3001\u81EA\u52D5\u4FDD\u5B58\u3092\u505C\u6B62\u3057\u3066\u3044\u307E\u3059(\u7834\u640D\u30C7\u30FC\u30BF\u306F\u5225\u9818\u57DF\u306B\u9000\u907F\u6E08\u307F)\u3002\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u306EJSON\u3092\u30A4\u30F3\u30DD\u30FC\u30C8\u3059\u308B\u304B\u3001\u8A2D\u5B9A\u306E\u300C\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u300D\u304B\u3089\u5FA9\u5143\u3057\u3066\u304F\u3060\u3055\u3044\u3002"), /*#__PURE__*/React.createElement("div", {
    className: "k-import-banner-buttons"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    onClick: () => fileInputRef.current && fileInputRef.current.click()
  }, "\u2B06 \u30A4\u30F3\u30DD\u30FC\u30C8"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: () => setLoadError(false)
  }, "\u7A7A\u3067\u958B\u59CB"))), isEmpty && !importPromptDismissed && !loadError && /*#__PURE__*/React.createElement("div", {
    className: "k-import-banner"
  }, /*#__PURE__*/React.createElement("span", null, "\u8A18\u9332\u304C\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u306EJSON\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308C\u3070\u30A4\u30F3\u30DD\u30FC\u30C8\u3067\u304D\u307E\u3059\u3002"), /*#__PURE__*/React.createElement("div", {
    className: "k-import-banner-buttons"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    onClick: () => fileInputRef.current && fileInputRef.current.click()
  }, "\u2B06 \u30A4\u30F3\u30DD\u30FC\u30C8"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: () => setImportPromptDismissed(true)
  }, "\u30B9\u30AD\u30C3\u30D7"))), needsFilePermission && /*#__PURE__*/React.createElement("div", {
    className: "k-import-banner"
  }, /*#__PURE__*/React.createElement("span", null, "\u4FDD\u5B58\u5148\u30D5\u30A1\u30A4\u30EB\u300C", savedFileName, "\u300D\u3078\u306E\u66F8\u304D\u8FBC\u307F\u8A31\u53EF\u304C\u5FC5\u8981\u3067\u3059(\u30D5\u30A1\u30A4\u30EB\u306E\u9078\u3073\u76F4\u3057\u306F\u4E0D\u8981\u3067\u3059)\u3002"), /*#__PURE__*/React.createElement("div", {
    className: "k-import-banner-buttons"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    onClick: reauthorizeFile
  }, "\uD83D\uDD13 \u8A31\u53EF\u3059\u308B"))), calHidden && /*#__PURE__*/React.createElement("button", {
    className: "k-back-cal",
    onClick: backToCalendar
  }, "\u2191 \u30AB\u30EC\u30F3\u30C0\u30FC\u306B\u623B\u308B"), /*#__PURE__*/React.createElement("div", {
    className: "k-ledger",
    id: "k-ledger"
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-ledger-head",
    id: "k-calendar-top"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-nav",
    onClick: () => changeMonth(-1)
  }, "\u2039"), /*#__PURE__*/React.createElement("h2", null, view.y, "\u5E74 ", monthLabel(view.m)), /*#__PURE__*/React.createElement("button", {
    className: "k-nav",
    onClick: () => changeMonth(1)
  }, "\u203A"), /*#__PURE__*/React.createElement("button", {
    className: "k-today-btn",
    onClick: goToday
  }, "\u4ECA\u65E5")), limitAlerts.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "k-limit-alerts"
  }, limitAlerts.map(c => {
    const level = limitLevelOf(c.mins, c.limitHours);
    const pct = Math.round(c.mins / (c.limitHours * 60) * 100);
    return /*#__PURE__*/React.createElement("div", {
      key: c.label,
      className: `k-limit-alert k-limit-alert-${level}`
    }, "\u26A0 ", c.label, " ", minutesToLabel(c.mins), " / ", c.limitHours, "\u6642\u9593\uFF08", pct, "%\uFF09", level === "over" ? " 上限を超えています" : " 上限に近づいています");
  })), /*#__PURE__*/React.createElement("div", {
    className: "k-bulk-bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: `k-bulk-toggle ${bulkMode ? "k-bulk-toggle-on" : ""}`,
    onClick: toggleBulkMode
  }, "\u2611 \u4E00\u62EC\u5165\u529B", bulkMode ? "を終了" : "")), bulkMode && /*#__PURE__*/React.createElement("div", {
    className: "k-bulk-panel"
  }, /*#__PURE__*/React.createElement("p", {
    className: "k-memo-hint"
  }, "\u30AB\u30EC\u30F3\u30C0\u30FC\u306E\u65E5\u4ED8\u3001\u307E\u305F\u306F\u8868\u306E\u5DE6\u306E\u30C1\u30A7\u30C3\u30AF\u3067\u65E5\u3092\u9078\u3073\u3001\u696D\u52D9\u5185\u5BB9\u3092\u307E\u3068\u3081\u3066\u5165\u529B\u3057\u307E\u3059\u3002"), /*#__PURE__*/React.createElement("div", {
    className: "k-bulk-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-bulk-chip",
    onClick: () => selectDays(d => isWeekend(view.y, view.m, d))
  }, "\u571F\u65E5\u3092\u9078\u629E"), /*#__PURE__*/React.createElement("button", {
    className: "k-bulk-chip",
    onClick: () => selectDays(() => true)
  }, "\u5168\u65E5\u3092\u9078\u629E"), /*#__PURE__*/React.createElement("button", {
    className: "k-bulk-chip",
    onClick: () => setBulkSel({})
  }, "\u9078\u629E\u89E3\u9664"), /*#__PURE__*/React.createElement("span", {
    className: "k-bulk-count"
  }, selectedKeys.length, "\u65E5\u9078\u629E\u4E2D")), /*#__PURE__*/React.createElement("div", {
    className: "k-bulk-row"
  }, /*#__PURE__*/React.createElement("select", {
    className: "k-note-select k-bulk-select",
    value: bulkNote,
    onChange: e => setBulkNote(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\u696D\u52D9\u5185\u5BB9\u3092\u9078\u629E\u2026"), workTypeOptions.filter(o => o).map(opt => /*#__PURE__*/React.createElement("option", {
    key: opt,
    value: opt
  }, opt)), /*#__PURE__*/React.createElement("option", {
    value: BULK_CLEAR
  }, "\u2015 \u7A7A\u306B\u3059\u308B(\u51FA\u9000\u52E4\u3082\u6D88\u3048\u307E\u3059)")), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    disabled: !bulkNote || !selectedKeys.length,
    onClick: applyBulk
  }, "\u9078\u629E\u65E5\u306B\u5165\u529B")), bulkNote === NIGHT_NOTE && workTypeOptions.includes(AFTER_NIGHT_NOTE) && /*#__PURE__*/React.createElement("label", {
    className: "k-bulk-check"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: bulkAddAfter,
    onChange: e => setBulkAddAfter(e.target.checked)
  }), "\u7FCC\u65E5\u306B\u300C", AFTER_NIGHT_NOTE, "\u300D\u3082\u5165\u529B\u3059\u308B(\u672A\u5165\u529B\u306E\u65E5\u306E\u307F)"), /*#__PURE__*/React.createElement("div", {
    className: "k-bulk-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: copyPrevMonth
  }, "\uD83D\uDCCB ", prevMonth, "\u6708\u306E\u30D1\u30BF\u30FC\u30F3\u3092\u30B3\u30D4\u30FC")), bulkMsg && /*#__PURE__*/React.createElement("div", {
    className: "k-bulk-msg"
  }, bulkMsg)), /*#__PURE__*/React.createElement("div", {
    className: "k-mini-cal",
    id: "k-mini-cal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-mini-cal-weekdays"
  }, ["日", "月", "火", "水", "木", "金", "土"].map(wd => /*#__PURE__*/React.createElement("div", {
    key: wd,
    className: `k-mini-cal-wd ${wd === "日" || wd === "土" ? "k-weekend-text" : ""}`
  }, wd))), /*#__PURE__*/React.createElement("div", {
    className: "k-mini-cal-grid"
  }, Array.from({
    length: new Date(view.y, view.m - 1, 1).getDay()
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: `blank-${i}`,
    className: "k-mini-cal-day k-mini-cal-blank"
  })), dayList.map(d => {
    const key = dateKey(view.y, view.m, d);
    const rec = records[key];
    const isToday = key === todayKey;
    const weekend = isWeekend(view.y, view.m, d);
    const cls = ["k-mini-cal-day", isToday ? "k-mini-cal-today" : "", rec?.isLeave ? "k-mini-cal-leave" : "", weekend && !isToday && !rec?.isLeave ? "k-weekend-text" : "", bulkMode && bulkSel[key] ? "k-mini-cal-selected" : ""].join(" ").trim();
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      className: cls,
      onClick: () => bulkMode ? toggleSelect(key) : jumpToDate(key),
      title: `${d}日${rec?.note ? " " + rec.note : ""}`
    }, /*#__PURE__*/React.createElement("span", {
      className: "k-mini-cal-daynum"
    }, d), rec?.note && /*#__PURE__*/React.createElement("span", {
      className: "k-mini-cal-note"
    }, rec.note));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "k-table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "k-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "k-col-date"
  }, "\u65E5\u4ED8"), /*#__PURE__*/React.createElement("th", {
    className: "k-col-note"
  }, "\u696D\u52D9\u5185\u5BB9"), /*#__PURE__*/React.createElement("th", null, "\u51FA\u52E4"), /*#__PURE__*/React.createElement("th", null, "\u9000\u52E4"), /*#__PURE__*/React.createElement("th", {
    className: "k-col-ot"
  }, "\u6642\u9593\u5916"), /*#__PURE__*/React.createElement("th", {
    className: "k-col-work"
  }, "\u4F5C\u696D\u6642\u9593"), /*#__PURE__*/React.createElement("th", {
    className: "k-col-remark"
  }, "\u5099\u8003"))), /*#__PURE__*/React.createElement("tbody", null, dayList.map(d => {
    const key = dateKey(view.y, view.m, d);
    const rec = records[key] || {};
    const weekend = isWeekend(view.y, view.m, d);
    const isToday = key === todayKey;
    const dayLocked = !!rec.locked;
    const rowClass = rec.isLeave ? "k-leave-row" : isToday ? "k-today" : d % 2 === 0 ? "k-stripe-b" : "k-stripe-a";
    let otMinutes = 0;
    let workText = "―";
    const hasBasis = rec.clockIn && rec.clockOut || rec.otStart && rec.otEnd;
    if (!rec.isLeave && hasBasis) {
      otMinutes = overtimeMinutesFor(rec);
      workText = minutesToLabel(standardHoursFor(rec) * 60 + otMinutes);
    }
    return /*#__PURE__*/React.createElement("tr", {
      key: key,
      id: `row-${key}`,
      className: bulkMode && bulkSel[key] ? `${rowClass} k-row-selected` : rowClass
    }, /*#__PURE__*/React.createElement("td", {
      className: "k-col-date",
      "data-label": "\u65E5\u4ED8"
    }, bulkMode && /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      className: "k-bulk-checkbox",
      checked: !!bulkSel[key],
      onChange: () => toggleSelect(key),
      title: "\u4E00\u62EC\u5165\u529B\u306E\u5BFE\u8C61\u306B\u3059\u308B"
    }), /*#__PURE__*/React.createElement("span", {
      className: "k-day-num"
    }, d), /*#__PURE__*/React.createElement("span", {
      className: `k-day-wd ${weekend ? "k-weekend-text" : ""}`
    }, "\uFF08", weekdayLabel(view.y, view.m, d), "\uFF09"), /*#__PURE__*/React.createElement("button", {
      className: `k-lock-btn ${dayLocked ? "k-lock-btn-locked" : ""}`,
      onClick: () => toggleDayLock(key),
      title: "\u3053\u306E\u65E5\u3092\u30ED\u30C3\u30AF/\u89E3\u9664"
    }, dayLocked ? "🔒 ロック中" : "🔓 編集可")), /*#__PURE__*/React.createElement("td", {
      className: "k-col-note",
      "data-label": "\u696D\u52D9\u5185\u5BB9"
    }, /*#__PURE__*/React.createElement("select", {
      className: "k-note-select",
      disabled: dayLocked,
      style: holidayTypes.includes(rec.note) ? {
        color: "#a35d4e",
        fontWeight: 700
      } : undefined,
      value: rec.note || "",
      onChange: e => {
        onNoteChange(key, e.target.value);
        suggestAfterNight(key, e.target.value);
      }
    }, workTypeOptions.map(opt => /*#__PURE__*/React.createElement("option", {
      key: opt || "blank",
      value: opt,
      style: holidayTypes.includes(opt) ? {
        color: "#a35d4e"
      } : undefined
    }, opt || "―")))), rec.isLeave ? /*#__PURE__*/React.createElement("td", {
      colSpan: 2,
      className: "k-leave-cell",
      "data-label": "\u51FA\u52E4\u30FB\u9000\u52E4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "k-leave-inner"
    }, /*#__PURE__*/React.createElement("span", {
      className: "k-leave-stamp"
    }, "\u6709\u4F11"), /*#__PURE__*/React.createElement("button", {
      className: "k-mini-btn",
      disabled: dayLocked,
      onClick: () => toggleLeave(key, false),
      title: "\u6709\u4F11\u3092\u53D6\u6D88"
    }, "\u21BA"))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("td", {
      "data-label": "\u51FA\u52E4"
    }, /*#__PURE__*/React.createElement("input", {
      type: "time",
      disabled: dayLocked,
      value: rec.clockIn || "",
      onChange: e => updateRecord(key, {
        clockIn: e.target.value
      })
    })), /*#__PURE__*/React.createElement("td", {
      "data-label": "\u9000\u52E4"
    }, /*#__PURE__*/React.createElement("input", {
      type: "time",
      disabled: dayLocked,
      value: rec.clockOut || "",
      onChange: e => updateRecord(key, {
        clockOut: e.target.value
      })
    }))), /*#__PURE__*/React.createElement("td", {
      className: "k-ot-cell",
      "data-label": "\u6642\u9593\u5916"
    }, rec.isLeave ? "―" : /*#__PURE__*/React.createElement("div", {
      className: "k-ot-range"
    }, /*#__PURE__*/React.createElement("div", {
      className: "k-ot-range-inputs"
    }, /*#__PURE__*/React.createElement("input", {
      type: "time",
      disabled: dayLocked,
      className: "k-ot-time",
      value: rec.otStart || "",
      onChange: e => updateRecord(key, {
        otStart: e.target.value
      })
    }), /*#__PURE__*/React.createElement("span", null, "\u301C"), /*#__PURE__*/React.createElement("input", {
      type: "time",
      disabled: dayLocked,
      className: "k-ot-time",
      value: rec.otEnd || "",
      onChange: e => updateRecord(key, {
        otEnd: e.target.value
      })
    })), /*#__PURE__*/React.createElement("div", {
      className: `k-ot-result ${rec.otStart && rec.otEnd ? "k-ot-manual" : ""}`
    }, hasBasis ? minutesToLabel(otMinutes) : "―"))), /*#__PURE__*/React.createElement("td", {
      className: "k-ot-cell k-work-cell k-col-work",
      "data-label": "\u4F5C\u696D\u6642\u9593"
    }, workText), /*#__PURE__*/React.createElement("td", {
      className: "k-col-remark",
      "data-label": "\u5099\u8003"
    }, rec.isLeave ? /*#__PURE__*/React.createElement("span", {
      className: "k-leave-seq-cell"
    }, allLeaveDatesSorted.indexOf(key) + 1, "\u56DE\u76EE") : /*#__PURE__*/React.createElement("input", {
      type: "text",
      disabled: dayLocked,
      className: "k-remark-input",
      placeholder: "\u5099\u8003",
      title: rec.remark || "",
      value: rec.remark || "",
      onChange: e => updateRecord(key, {
        remark: e.target.value
      })
    })));
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "k-bottom"
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-card"
  }, /*#__PURE__*/React.createElement("h3", null, "\u4ECA\u6708\u306E\u307E\u3068\u3081"), /*#__PURE__*/React.createElement("dl", {
    className: "k-stat-list"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "\u52E4\u52D9\u65E5\u6570"), /*#__PURE__*/React.createElement("dd", null, monthWorkDays, "\u65E5")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "\u4F11\u65E5"), /*#__PURE__*/React.createElement("dd", null, monthHolidays, "\u65E5")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "\u6CD5\u5B9A"), /*#__PURE__*/React.createElement("dd", null, monthStatutoryHolidays, "\u65E5")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "\u6CD5\u5B9A\u4F11\u65E5\u52B4\u50CD"), /*#__PURE__*/React.createElement("dd", null, minutesToLabel(monthStatutoryWork))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "\u6709\u7D66\u53D6\u5F97\u65E5\u6570"), /*#__PURE__*/React.createElement("dd", null, monthLeaveDays, "\u65E5"))), /*#__PURE__*/React.createElement("div", {
    className: "k-limit-list"
  }, limitChecks.map(c => /*#__PURE__*/React.createElement(LimitMeter, _extends({
    key: c.label
  }, c)))), /*#__PURE__*/React.createElement("p", {
    className: "k-limit-note"
  }, "36\u5354\u5B9A\u306E\u4E00\u822C\u7684\u306A\u4E0A\u9650(\u670845\u6642\u9593\u30FB\u5E74360\u6642\u9593\u3001\u4F11\u65E5\u52B4\u50CD\u3092\u542B\u3081\u6708100\u6642\u9593\u672A\u6E80)\u3067\u5224\u5B9A\u3057\u3066\u3044\u307E\u3059\u3002 \u300C\u6CD5\u5B9A\u300D\u306E\u65E5\u306E\u52B4\u50CD\u306F\u6CD5\u5B9A\u4F11\u65E5\u52B4\u50CD\u3068\u3057\u3066\u5225\u306B\u96C6\u8A08\u3057\u3001\u6642\u9593\u5916\u306B\u306F\u542B\u3081\u307E\u305B\u3093\u3002\u7279\u5225\u6761\u9805\u306E\u4E0A\u9650\u306B\u306F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002")), /*#__PURE__*/React.createElement("div", {
    className: "k-bottom-buttons"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    onClick: () => setShowLeave(true)
  }, "\uD83D\uDDD3 \u6709\u7D66\u4F11\u6687"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    onClick: () => setShowMemo(true)
  }, "\uD83D\uDCDD \u30E1\u30E2"), /*#__PURE__*/React.createElement("button", {
    className: "k-settings-toggle",
    onClick: () => setShowSettings(true)
  }, "\u2699 \u8A2D\u5B9A"))), suggestion && /*#__PURE__*/React.createElement("div", {
    className: "k-suggest"
  }, /*#__PURE__*/React.createElement("span", null, "\u6CCA\u306E\u7FCC\u65E5\uFF08", Number(suggestion.key.slice(5, 7)), "\u6708", Number(suggestion.key.slice(8, 10)), "\u65E5\uFF09\u3092\u300C", suggestion.note, "\u300D\u306B\u3057\u307E\u3059\u304B\uFF1F"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    onClick: acceptSuggestion
  }, "\u5165\u529B\u3059\u308B"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: () => setSuggestion(null)
  }, "\u9589\u3058\u308B")), showLeave && /*#__PURE__*/React.createElement("div", {
    className: "k-modal-overlay",
    onClick: () => setShowLeave(false)
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-modal",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-modal-head"
  }, /*#__PURE__*/React.createElement("h3", null, "\u6709\u7D66\u4F11\u6687\uFF08", view.y, "\u5E74\uFF09"), /*#__PURE__*/React.createElement("button", {
    className: "k-icon-btn",
    onClick: () => setShowLeave(false)
  }, "\u2715")), /*#__PURE__*/React.createElement("dl", {
    className: "k-stat-list"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "\u4ED8\u4E0E\u65E5\u6570"), /*#__PURE__*/React.createElement("dd", null, settings.paidLeaveTotal, "\u65E5")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "\u53D6\u5F97\u65E5\u6570"), /*#__PURE__*/React.createElement("dd", null, leavesThisYear, "\u65E5")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", {
    className: "k-highlight"
  }, "\u6B8B\u65E5\u6570"), /*#__PURE__*/React.createElement("dd", {
    className: "k-highlight"
  }, leaveRemaining, "\u65E5"))), /*#__PURE__*/React.createElement("div", {
    className: "k-leave-add"
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: leavePickDate,
    onChange: e => setLeavePickDate(e.target.value)
  }), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary",
    onClick: addLeave,
    disabled: !leavePickDate
  }, "\uFF0B \u53D6\u5F97\u767B\u9332")), leaveDatesThisYear.length > 0 && /*#__PURE__*/React.createElement("ul", {
    className: "k-leave-dates"
  }, leaveDatesThisYear.map(k => {
    const [y, m, d] = k.split("-").map(Number);
    const seq = allLeaveDatesSorted.indexOf(k) + 1;
    return /*#__PURE__*/React.createElement("li", {
      key: k
    }, /*#__PURE__*/React.createElement("span", null, m, "\u6708", d, "\u65E5\uFF08", weekdayLabel(y, m, d), "\uFF09", /*#__PURE__*/React.createElement("span", {
      className: "k-leave-seq"
    }, seq, "\u56DE\u76EE")), /*#__PURE__*/React.createElement("button", {
      className: "k-mini-btn",
      onClick: () => toggleLeave(k, false),
      title: "\u6709\u4F11\u3092\u53D6\u6D88"
    }, "\u21BA"));
  })))), showMemo && /*#__PURE__*/React.createElement("div", {
    className: "k-modal-overlay",
    onClick: () => setShowMemo(false)
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-modal",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-modal-head"
  }, /*#__PURE__*/React.createElement("h3", null, "\u30E1\u30E2\u30FB\u4F7F\u7528\u65B9\u6CD5"), /*#__PURE__*/React.createElement("button", {
    className: "k-icon-btn",
    onClick: () => setShowMemo(false)
  }, "\u2715")), /*#__PURE__*/React.createElement("p", {
    className: "k-memo-hint"
  }, "\u51FA\u52E4\u7C3F\u306E\u4F7F\u3044\u65B9\u3084\u6CE8\u610F\u70B9\u306A\u3069\u3001\u81EA\u7531\u306B\u66F8\u304D\u7559\u3081\u3066\u304A\u3051\u307E\u3059\u3002"), /*#__PURE__*/React.createElement("textarea", {
    className: "k-memo-textarea",
    value: memo,
    onChange: e => setMemo(e.target.value),
    placeholder: "\u3053\u3053\u306B\u30E1\u30E2\u3092\u5165\u529B\u2026"
  }))), showSettings && /*#__PURE__*/React.createElement("div", {
    className: "k-modal-overlay",
    onClick: () => {
      setShowSettings(false);
      setConfirmReset(false);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-modal",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "k-modal-head"
  }, /*#__PURE__*/React.createElement("h3", null, "\u8A2D\u5B9A"), /*#__PURE__*/React.createElement("button", {
    className: "k-icon-btn",
    onClick: () => {
      setShowSettings(false);
      setConfirmReset(false);
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("label", {
    className: "k-field"
  }, "\u6240\u5B9A\u52B4\u50CD\u6642\u9593", /*#__PURE__*/React.createElement("select", {
    value: settings.standardHours,
    onChange: e => setSettings(s => ({
      ...s,
      standardHours: Number(e.target.value)
    }))
  }, /*#__PURE__*/React.createElement("option", {
    value: "8"
  }, "08:00"), /*#__PURE__*/React.createElement("option", {
    value: "7.5"
  }, "07:30"), /*#__PURE__*/React.createElement("option", {
    value: "6.5"
  }, "06:30"), /*#__PURE__*/React.createElement("option", {
    value: "6"
  }, "06:00"))), /*#__PURE__*/React.createElement("label", {
    className: "k-field"
  }, "\u5E74\u9593\u6709\u7D66\u4ED8\u4E0E\u65E5\u6570", /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "0",
    max: "40",
    step: "1",
    value: settings.paidLeaveTotal,
    onChange: e => setSettings(s => ({
      ...s,
      paidLeaveTotal: Number(e.target.value) || 0
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "k-io-zone"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: handleExport
  }, "\u2B07 \u30C7\u30FC\u30BF\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: () => fileInputRef.current && fileInputRef.current.click()
  }, "\u2B06 \u30C7\u30FC\u30BF\u3092\u30A4\u30F3\u30DD\u30FC\u30C8"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: () => workTypeFileRef.current && workTypeFileRef.current.click()
  }, "\uD83D\uDEE0 \u696D\u52D9\u5185\u5BB9\u306E\u81EA\u52D5\u5165\u529B\u8A2D\u5B9A\u3092CSV\u3067\u66F4\u65B0"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: () => ledgerCsvFileRef.current && ledgerCsvFileRef.current.click()
  }, "\uD83D\uDCC4 \u696D\u52D9\u5185\u5BB9CSV\u304B\u3089\u53D6\u308A\u8FBC\u307F")), /*#__PURE__*/React.createElement("div", {
    className: "k-backup-zone"
  }, /*#__PURE__*/React.createElement("p", {
    className: "k-memo-hint"
  }, "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7(\u76F4\u8FD1", BACKUP_KEEP_DAYS, "\u65E5\u5206\u30FB\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u5185\u306B\u4FDD\u5B58)"), backups.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "k-memo-hint"
  }, "\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002") : /*#__PURE__*/React.createElement("ul", {
    className: "k-leave-dates"
  }, backups.map((b, i) => /*#__PURE__*/React.createElement("li", {
    key: `${b.at}-${b.reason}-${i}`
  }, /*#__PURE__*/React.createElement("span", null, b.at, /*#__PURE__*/React.createElement("span", {
    className: "k-leave-seq"
  }, b.reason)), /*#__PURE__*/React.createElement("button", {
    className: "k-mini-btn",
    onClick: () => restoreBackup(b),
    title: "\u3053\u306E\u6642\u70B9\u306B\u5FA9\u5143"
  }, "\u21A9 \u5FA9\u5143"))))), /*#__PURE__*/React.createElement("div", {
    className: "k-danger-zone"
  }, !confirmReset ? /*#__PURE__*/React.createElement("button", {
    className: "k-btn-danger",
    onClick: () => setConfirmReset(true)
  }, "\uD83D\uDDD1 \u5165\u529B\u30C7\u30FC\u30BF\u3092\u30EA\u30BB\u30C3\u30C8") : /*#__PURE__*/React.createElement("div", {
    className: "k-danger-confirm"
  }, /*#__PURE__*/React.createElement("p", null, "\u3059\u3079\u3066\u306E\u51FA\u9000\u52E4\u8A18\u9332\u30FB\u696D\u52D9\u5185\u5BB9\u30FB\u6709\u7D66\u4F11\u6687\u306E\u8A18\u9332\u3092\u524A\u9664\u3057\u307E\u3059\u3002\u3053\u306E\u64CD\u4F5C\u306F\u5143\u306B\u623B\u305B\u307E\u305B\u3093\u3002"), /*#__PURE__*/React.createElement("div", {
    className: "k-danger-confirm-buttons"
  }, /*#__PURE__*/React.createElement("button", {
    className: "k-btn-danger",
    onClick: resetAllData
  }, "\u524A\u9664\u3059\u308B"), /*#__PURE__*/React.createElement("button", {
    className: "k-btn-secondary-outline",
    onClick: () => setConfirmReset(false)
  }, "\u30AD\u30E3\u30F3\u30BB\u30EB")))))));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(KintaiApp, null));

// PWA: http(s)で配信されているときだけService Workerを登録する(file://や非対応ブラウザでは何もしない)。
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(e => {
      console.warn("Service Workerの登録に失敗しました", e);
    });
  });
}
