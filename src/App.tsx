import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings2,
  Sun,
  Moon,
  MapPin,
  UserRound,
  ArrowUpRight,
  Download,
  Upload,
  Trash2,
  X,
  Check,
  Coffee,
  ShieldCheck,
  Clock3,
  WifiOff,
  PanelTop,
  Sparkles,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  active,
  addDays,
  colors,
  conflicts,
  dateKey,
  defaultData,
  demoCourses,
  monday,
  parseDate,
  selectWeeks,
  teachingWeek,
  validateData,
  weekdays,
  type Course,
  type Data,
} from "./domain";
import {
  loadData,
  saveData,
  saveImportedData,
  loadImportBackup,
} from "./storage";
import WeekBoard from "./components/WeekBoard";
import ImportWizard from "./components/ImportWizard";
import { pendingCandidate } from "./imports/merge";
import type { ImportResult } from "./imports/types";
const fmt = (d: Date, options: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString("zh-CN", options);
const weekLabel = (w: number, total: number) =>
  w < 1 ? "尚未开学" : w > total ? "学期已结束" : `第 ${w} 周`;
function App() {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState<"today" | "week" | "settings">("week"),
    [selected, setSelected] = useState(dateKey(new Date())),
    [editing, setEditing] = useState<Course | null | undefined>(undefined),
    [toast, setToast] = useState(""),
    [fatal, setFatal] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [now, setNow] = useState(new Date());
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();
  const [importing, setImporting] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const [backupAt, setBackupAt] = useState("");
  useEffect(() => {
    loadImportBackup()
      .then((b) => setBackupAt(b?.at || ""))
      .catch(() => {});
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = dateKey(now);
  useEffect(() => {
    loadData()
      .then(setData)
      .catch(() =>
        setFatal(
          "无法读取本机课表。请检查是否允许网站使用本地存储；为保护已有数据，应用没有覆盖它。",
        ),
      );
  }, []);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 30000);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (!data) return;
    document.documentElement.dataset.theme = data.theme;
  }, [data?.theme]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  async function commit(next: Data, backup = false) {
    if (busy) return false;
    setBusy(true);
    try {
      if (backup) {
        await saveImportedData(next, data!);
        setBackupAt(new Date().toISOString());
      } else await saveData(next);
      setData(next);
      return true;
    } catch {
      setToast("保存失败：本地存储不可用或空间不足。请先导出备份。");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (fatal)
    return (
      <main className="loading">
        <ShieldCheck size={40} />
        <h1>本地存储暂不可用</h1>
        <p>{fatal}</p>
        <button onClick={() => location.reload()}>重新尝试</button>
      </main>
    );
  if (!data)
    return (
      <main className="loading">
        <BookOpen size={40} />
        <p>正在打开你的课表…</p>
      </main>
    );
  const d = data,
    date = parseDate(selected),
    week = teachingWeek(date, d.semester),
    start = monday(date),
    currentWeek = teachingWeek(now, d.semester);
  const daily = d.courses
    .filter((c) => c.day === (date.getDay() || 7) && active(c, week))
    .sort((a, b) => a.start - b.start);
  const weekCourses = d.courses.filter((c) => active(c, week));
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const ongoing = daily.find(
    (c) =>
      selected === today &&
      toMin(d.periods[c.start - 1].start) <= minutes &&
      toMin(d.periods[c.end - 1].end) > minutes,
  );
  const next = daily.find(
    (c) => selected !== today || toMin(d.periods[c.start - 1].start) > minutes,
  );
  const conflictCount = d.courses.filter((c, i) =>
    d.courses.slice(i + 1).some((b) => conflicts(c, b)),
  ).length;
  const nav = [
    { id: "today" as const, label: "今日", icon: Sun },
    { id: "week" as const, label: "课表", icon: CalendarDays },
    { id: "settings" as const, label: "设置", icon: Settings2 },
  ];
  async function addDemo() {
    const courses = demoCourses(d.totalWeeks);
    if (courses.some((c) => d.courses.some((b) => conflicts(c, b)))) {
      setToast("演示课程与现有课程冲突，请在空课表中体验");
      return;
    }
    if (await commit({ ...d, courses: [...d.courses, ...courses] }))
      setToast("已载入演示课程，可在设置中一键清除");
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(d, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MyTimetable-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("备份已导出，请妥善保存下载的文件");
  }
  async function importData(file?: File) {
    if (!file) return;
    if (file.size > 64 * 1024 * 1024) {
      setToast("备份文件不能超过 64 MB");
      return;
    }
    try {
      const imported = validateData(JSON.parse(await file.text()));
      if (
        !window.confirm(
          `恢复备份将替换本机的 ${d.courses.length} 门课程和全部设置，是否继续？建议先导出备份。`,
        )
      )
        return;
      if (await commit(imported, true)) setToast("课表已从备份恢复");
    } catch (e) {
      setToast(
        e instanceof Error ? `无法导入：${e.message}` : "无法导入此文件",
      );
    }
  }
  function courseCard(c: Course, compact = false) {
    const overlap = d.courses.some((b) => conflicts(c, b));
    return (
      <button
        key={c.id}
        className={`course ${c.color} ${compact ? "compact" : ""}`}
        onClick={() => setEditing(c)}
        aria-label={`编辑${c.name}`}
      >
        <div className="course-top">
          <span>
            {c.start}–{c.end} 节
          </span>
          {overlap ? (
            <span className="conflict">时间冲突</span>
          ) : (
            <ArrowUpRight size={16} />
          )}
        </div>
        <h3>{c.name}</h3>
        <p>
          <MapPin size={14} />
          {c.room || "教室待定"}
        </p>
        {!compact && (
          <div className="course-bottom">
            <span>
              <UserRound size={14} />
              {c.teacher || "教师待定"}
            </span>
            <span>
              {d.periods[c.start - 1].start} – {d.periods[c.end - 1].end}
            </span>
          </div>
        )}
      </button>
    );
  }
  return (
    <div className={`app-shell ${tab === "week" ? "week-mode" : ""}`}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("today");
          }}
        >
          <span className="brand-icon">
            <BookOpen size={24} />
          </span>
          <span>
            MyTimetable<small>把时间留给生活</small>
          </span>
        </a>
        <div className="nav-caption">我的校园</div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              onClick={() => setTab(id)}
            >
              <Icon size={20} />
              {label}
              {tab === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-ornament">✳</span>
          <p>
            认真上课，
            <br />
            也好好生活。
          </p>
          <small>每一天，都有新的可能</small>
        </div>
        <div className="privacy">
          <ShieldCheck size={17} />
          <span>
            只属于你的课表<small>本地保存 · 无广告 · 无追踪</small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="topbar-title">
            我的课表 <span>/</span>{" "}
            {tab === "settings"
              ? "偏好设置"
              : tab === "week"
                ? "一周安排"
                : "今日安排"}
          </span>
          <span className="top-status">
            {!online ? (
              <>
                <WifiOff size={14} />
                离线模式
              </>
            ) : (
              <>
                <span className="status-dot" />
                本机存储
              </>
            )}
          </span>
          <button
            className="icon-btn theme-button"
            aria-label="切换深浅色"
            onClick={() =>
              commit({
                ...d,
                theme: document.documentElement.matches('[data-theme="dark"]')
                  ? "light"
                  : d.theme === "system" &&
                      matchMedia("(prefers-color-scheme: dark)").matches
                    ? "light"
                    : "dark",
              })
            }
          >
            <Moon size={17} />
          </button>
        </header>
        <main>
          {tab === "week" && (
            <WeekBoard
              data={d}
              selected={selected}
              today={today}
              onDate={setSelected}
              onEdit={setEditing}
              onImport={() => setImporting(true)}
              onSettings={() => setTab("settings")}
              onPending={() => {
                setReviewPending(true);
                setImporting(true);
              }}
            />
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {tab === "settings"
                  ? "让课表适合你"
                  : fmt(date, {
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                    })}
              </p>
              <h1>
                {tab === "settings"
                  ? "一切，刚刚好。"
                  : tab === "week"
                    ? "一周，从容安排。"
                    : "今天，也有新收获。"}
                <span className="heading-dot">°</span>
              </h1>
              <p className="subtitle">
                {tab === "settings"
                  ? "属于你的习惯，保存在你的设备。"
                  : tab === "week"
                    ? "把忙碌变得清晰，给生活留一点空白。"
                    : "每一节课，都是向前的一小步。"}
              </p>
            </div>
            {tab !== "settings" && (
              <button
                className="primary add-button"
                onClick={() => setEditing(null)}
              >
                <Plus size={18} />
                添加课程
              </button>
            )}
          </div>
          {tab === "today" && (
            <>
              <div className="calendar-bar">
                <div className="month-label">
                  <CalendarDays size={18} />
                  <strong>
                    {fmt(start, { year: "numeric", month: "long" })}
                  </strong>
                  <span className="week-pill">
                    {weekLabel(week, d.totalWeeks)}
                  </span>
                </div>
                <div className="week-controls">
                  <button
                    className="icon-btn"
                    aria-label="上一周"
                    onClick={() => setSelected(dateKey(addDays(date, -7)))}
                  >
                    <ChevronLeft size={19} />
                  </button>
                  <button
                    className="today-button"
                    onClick={() => setSelected(today)}
                  >
                    回到今天
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="下一周"
                    onClick={() => setSelected(dateKey(addDays(date, 7)))}
                  >
                    <ChevronRight size={19} />
                  </button>
                </div>
              </div>
              <div className="date-strip">
                {weekdays.map((day, i) => {
                  const value = addDays(start, i),
                    key = dateKey(value),
                    has = d.courses.some(
                      (c) => c.day === i + 1 && active(c, week),
                    );
                  return (
                    <button
                      key={day}
                      className={`${selected === key ? "active" : ""} ${today === key ? "is-today" : ""}`}
                      onClick={() => setSelected(key)}
                      aria-label={fmt(value, {
                        month: "long",
                        day: "numeric",
                        weekday: "long",
                      })}
                      aria-pressed={selected === key}
                    >
                      <span>周{day}</span>
                      <strong>{value.getDate()}</strong>
                      <i className={has ? "has-course" : ""} />
                    </button>
                  );
                })}
              </div>
              {conflictCount > 0 && (
                <div className="notice">
                  有 {conflictCount}{" "}
                  组课程存在时间冲突，请打开标记的课程调整节次或周次。
                </div>
              )}
              {tab === "today" ? (
                <div className="today-layout">
                  <section>
                    <div className="section-heading">
                      <h2>
                        {selected === today
                          ? "今日课程"
                          : `${date.getMonth() + 1} 月 ${date.getDate()} 日的课程`}
                        <span>{daily.length.toString().padStart(2, "0")}</span>
                      </h2>
                      <span className="section-meta">
                        {daily.length
                          ? `共 ${daily.reduce((n, c) => n + c.end - c.start + 1, 0)} 节课`
                          : "给自己一点自由时间"}
                      </span>
                    </div>
                    {daily.length ? (
                      <div className="timeline">
                        {daily.map((c) => (
                          <div className="timeline-row" key={c.id}>
                            <div className="timeline-time">
                              <strong>{d.periods[c.start - 1].start}</strong>
                              <span>{d.periods[c.end - 1].end}</span>
                              <i />
                            </div>
                            {courseCard(c)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <div className="empty-art">
                          <Coffee size={48} strokeWidth={1.3} />
                          <span>✦</span>
                          <i />
                        </div>
                        <h3>
                          {week < 1
                            ? "新学期，还在路上"
                            : week > d.totalWeeks
                              ? "这一学期，辛苦了"
                              : "今天没有课"}
                        </h3>
                        <p>
                          {d.courses.length
                            ? "去散步、读书，或者什么也不做。"
                            : "从第一门课开始，慢慢安排你的校园生活。"}
                        </p>
                        <button
                          className="secondary"
                          onClick={() => setEditing(null)}
                        >
                          <Plus size={16} />
                          {d.courses.length ? "添加课程" : "添加第一门课"}
                        </button>
                        {!d.courses.length && (
                          <button
                            className="text-btn"
                            onClick={addDemo}
                            disabled={busy}
                          >
                            先体验演示课表 <ArrowUpRight size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                  <aside className="day-aside">
                    <div className="focus-card">
                      <span className="mini-label">
                        <span className="status-dot" />
                        {ongoing
                          ? "正在上课"
                          : next
                            ? "接下来的安排"
                            : "留一点时间给自己"}
                      </span>
                      <div className="focus-icon">
                        {ongoing || next ? (
                          <BookOpen size={27} strokeWidth={1.5} />
                        ) : (
                          <Coffee size={29} strokeWidth={1.5} />
                        )}
                      </div>
                      <h3>{(ongoing || next)?.name || "享受课余时光"}</h3>
                      <p>
                        {ongoing || next
                          ? `${d.periods[(ongoing || next)!.start - 1].start} · ${(ongoing || next)!.room || "教室待定"}`
                          : "放慢一点，也没关系。"}
                      </p>
                      <div className="focus-divider" />
                      <span className="focus-footer">
                        {selected === today
                          ? "今天的节奏，自己掌握。"
                          : "每一天，都值得认真对待。"}
                      </span>
                    </div>
                    <div className="week-summary">
                      <span className="mini-label">本周小记</span>
                      <div>
                        <strong>{weekCourses.length}</strong>
                        <span>次课程</span>
                        <span className="summary-icon">
                          <CalendarDays size={23} />
                        </span>
                      </div>
                      <p>
                        {weekLabel(week, d.totalWeeks)} · 共 {d.totalWeeks}{" "}
                        个教学周
                      </p>
                      <div className="progress-track">
                        <i
                          style={{
                            width: `${Math.min(100, Math.max(0, (week / d.totalWeeks) * 100))}%`,
                          }}
                        />
                      </div>
                      <small>一步一步，走向学期的终点。</small>
                    </div>
                    <div className="local-note">
                      <ShieldCheck size={17} />
                      <p>
                        课程只保存在这台设备上。
                        <br />
                        <button onClick={exportData}>
                          记得偶尔备份一下 <ArrowUpRight size={12} />
                        </button>
                      </p>
                    </div>
                  </aside>
                </div>
              ) : null}
            </>
          )}
          {tab === "settings" && (
            <div className="settings-layout">
              <div>
                <SettingsForm
                  data={d}
                  busy={busy}
                  onSave={async (next) => {
                    if (await commit(next)) setToast("学期与节次设置已保存");
                  }}
                />
                <section className="settings-card">
                  <h2>
                    <Sun size={19} />
                    外观
                  </h2>
                  <div className="appearance">
                    {(
                      [
                        { id: "system", name: "跟随系统", icon: PanelTop },
                        { id: "light", name: "浅色", icon: Sun },
                        { id: "dark", name: "深色", icon: Moon },
                      ] as const
                    ).map(({ id, name, icon: Icon }) => (
                      <button
                        key={id}
                        className={d.theme === id ? "chosen" : ""}
                        onClick={() => commit({ ...d, theme: id })}
                      >
                        <Icon size={20} />
                        {name}
                        {d.theme === id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
              <div>
                <section className="settings-card">
                  <h2>
                    <Upload size={19} />
                    导入课表
                  </h2>
                  <p>
                    北京农学院教学系统
                    PDF，在本机识别、核对后导入。请先确认学期与节次时间。
                  </p>
                  <button
                    className="primary"
                    onClick={() => {
                      setReviewPending(false);
                      setImporting(true);
                    }}
                  >
                    选择 PDF 并识别
                  </button>
                  {backupAt && (
                    <button
                      className="setting-action"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          const backup = await loadImportBackup();
                          if (
                            backup &&
                            window.confirm(
                              "恢复导入前课表？当前课表会成为新的恢复点。",
                            ) &&
                            (await commit(backup.data, true))
                          )
                            setToast("已恢复导入前的课表");
                        } catch {
                          setToast("恢复点无法读取，当前课表未修改");
                        }
                      }}
                    >
                      <Download size={18} />
                      <span>
                        恢复导入前的课表
                        <small>
                          {new Date(backupAt).toLocaleString("zh-CN")}
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  )}
                </section>
                <section className="settings-card">
                  <h2>
                    <BookOpen size={19} />
                    课程管理
                  </h2>
                  <p>
                    已安排 {d.courses.length} 项 · 其他／待确认{" "}
                    {d.otherCourses?.length || 0} 项
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setEditing(null)}
                  >
                    <Plus size={16} />
                    添加课程
                  </button>
                  {(d.otherCourses?.length || 0) > 0 && (
                    <button
                      className="setting-action"
                      onClick={() => {
                        setReviewPending(true);
                        setImporting(true);
                      }}
                    >
                      <span>
                        核对其他／待确认课程
                        <small>
                          军训、实践、线上等无明确时间的课程也保留在这里
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  )}
                  {(d.otherCourses || []).map((c) => (
                    <details className="pending-management" key={c.id}>
                      <summary>
                        {c.name}
                        <small>{c.reason}</small>
                      </summary>
                      <p>
                        {c.weekText || "周次待定"} · {c.teacher || "教师待定"} ·{" "}
                        {c.room || "地点待定"}
                      </p>
                      <pre>{c.raw}</pre>
                      <button
                        className="danger-link"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            window.confirm(`删除待确认课程「${c.name}」？`) &&
                            (await commit({
                              ...d,
                              otherCourses: d.otherCourses!.filter(
                                (x) => x.id !== c.id,
                              ),
                            }))
                          )
                            setToast("待确认课程已删除");
                        }}
                      >
                        删除此项
                      </button>
                    </details>
                  ))}
                  <div className="manage-list">
                    {d.courses.map((c) => (
                      <button key={c.id} onClick={() => setEditing(c)}>
                        <span>
                          {c.name}
                          <small>
                            周{weekdays[c.day - 1]} · {c.start}–{c.end} 节 ·{" "}
                            {c.room || "地点待定"}
                          </small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  </div>
                </section>
                <section className="settings-card">
                  <h2>
                    <ShieldCheck size={19} />
                    你的数据，你做主
                  </h2>
                  <p>
                    课程保存在本机
                    IndexedDB，不会上传。清除浏览器数据或更换设备会丢失课表，请定期手动备份。
                  </p>
                  <button className="setting-action" onClick={exportData}>
                    <Download size={18} />
                    <span>
                      导出课表<small>保存为 JSON 文件，随时备份</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="setting-action"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={18} />
                    <span>
                      从备份恢复<small>导入并替换本机课表与设置</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <input
                    hidden
                    type="file"
                    ref={fileRef}
                    accept=".json,application/json"
                    onChange={(e) => {
                      void importData(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </section>
                <section className="settings-card">
                  <h2>
                    <Sparkles size={19} />
                    轻松开始
                  </h2>
                  <p>
                    演示课程为虚构数据，仅用于体验。清除演示不会影响自行创建的课程。
                  </p>
                  {!d.courses.some((c) => c.demo) ? (
                    <button
                      className="secondary"
                      disabled={busy || d.periods.length < 8}
                      onClick={addDemo}
                    >
                      载入演示课程
                    </button>
                  ) : (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await commit({
                            ...d,
                            courses: d.courses.filter((c) => !c.demo),
                          })
                        )
                          setToast("演示课程已清除");
                      }}
                    >
                      一键清除演示课程
                    </button>
                  )}
                  {d.periods.length < 8 && (
                    <small>体验演示需至少 8 个节次。</small>
                  )}
                  <button
                    className="danger-link"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        window.confirm(
                          "确定清空所有课程？此操作无法撤销，建议先导出备份。",
                        ) &&
                        (await commit({ ...d, courses: [], otherCourses: [] }))
                      )
                        setToast("所有课程已清空");
                    }}
                  >
                    <Trash2 size={15} />
                    清空全部课程
                  </button>
                </section>
                <section className="install-card">
                  <span className="brand-icon">
                    <BookOpen size={24} />
                  </span>
                  <h3>让课表住进主屏幕</h3>
                  <p>
                    在 iPhone Safari
                    中点击“分享”，选择“添加到主屏幕”。首次联网打开并完成缓存后，即可离线使用。
                  </p>
                  <span>
                    {offlineReady
                      ? "离线资源已准备好"
                      : "首次打开时会自动缓存离线资源"}
                  </span>
                </section>
              </div>
            </div>
          )}
          <footer className="page-footer">
            <span>少一点打扰，多一点专注。</span>
            <span>
              MyTimetable <span className="footer-dot">·</span> 你的校园日常
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={21} />
            {label}
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {needRefresh && (
        <div className="update-banner">
          <span>新版本已准备好，课程数据会保留。</span>
          <button
            disabled={busy || editing !== undefined || importing}
            onClick={() => updateServiceWorker(true)}
          >
            更新
          </button>
        </div>
      )}
      {importing && (
        <ImportWizard
          data={d}
          onClose={() => {
            setImporting(false);
            setReviewPending(false);
          }}
          initial={
            reviewPending
              ? ({
                  source: "待确认课程",
                  candidates: (d.otherCourses || []).map(pendingCandidate),
                  warnings: [],
                  pages: 0,
                } as ImportResult)
              : undefined
          }
          onCommit={async (next, summary) => {
            const ok = await commit(next, true);
            if (ok) setToast(summary);
            return ok;
          }}
        />
      )}
      {editing !== undefined && (
        <CourseEditor
          course={editing}
          data={d}
          selected={selected}
          busy={busy}
          onClose={() => setEditing(undefined)}
          onSave={async (c) => {
            if (
              await commit({
                ...d,
                courses: [...d.courses.filter((x) => x.id !== c.id), c],
              })
            ) {
              setEditing(undefined);
              setToast("课程已保存");
            }
          }}
          onDelete={async (id) => {
            if (
              window.confirm("确定删除这门课程？") &&
              (await commit({
                ...d,
                courses: d.courses.filter((c) => c.id !== id),
              }))
            ) {
              setEditing(undefined);
              setToast("课程已删除");
            }
          }}
        />
      )}
      <span className="sr-only">
        当前教学周：{weekLabel(currentWeek, d.totalWeeks)}
      </span>
    </div>
  );
}
function CourseEditor({
  course,
  data,
  selected,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  course: Course | null;
  data: Data;
  selected: string;
  busy: boolean;
  onClose: () => void;
  onSave: (c: Course) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [color, setColor] = useState(course?.color || "sage"),
    [mode, setMode] = useState("all"),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const weeks = selectWeeks(String(f.get("weeks")), data.totalWeeks, mode);
      if (!weeks.length) throw Error("筛选后没有上课周次，请检查单双周设置");
      const c: Course = {
        id: course?.id || crypto.randomUUID(),
        name: String(f.get("name")).trim(),
        room: String(f.get("room")).trim(),
        teacher: String(f.get("teacher")).trim(),
        day: Number(f.get("day")),
        start: Number(f.get("start")),
        end: Number(f.get("end")),
        weeks,
        color,
        ...(course?.demo ? { demo: true } : {}),
        kind: String(f.get("kind") || ""),
        ...(course?.source ? { source: course.source } : {}),
        ...(course?.sourceText ? { sourceText: course.sourceText } : {}),
      };
      validateData({
        ...data,
        courses: [...data.courses.filter((x) => x.id !== c.id), c],
      });
      const overlap = data.courses.filter((b) => conflicts(c, b));
      if (overlap.length)
        throw Error(
          `与「${overlap.map((b) => b.name).join("、")}」时间冲突，请调整节次或上课周次`,
        );
      await onSave(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法保存课程");
    }
  }
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="course-modal"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">安排一份小小的期待</p>
            <h2 id="editor-title">{course ? "编辑课程" : "添加课程"}</h2>
          </div>
          <button
            className="icon-btn"
            disabled={busy}
            aria-label="关闭编辑"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        <form onSubmit={submit}>
          <label>
            课程名称
            <input
              name="name"
              placeholder="例如：高等数学"
              defaultValue={course?.name}
              required
              maxLength={80}
            />
          </label>
          <div className="form-row">
            <label>
              上课教室
              <input
                name="room"
                placeholder="例如：理科楼 A203"
                defaultValue={course?.room}
                maxLength={100}
              />
            </label>
            <label>
              任课教师
              <input
                name="teacher"
                placeholder="选填"
                defaultValue={course?.teacher}
                maxLength={80}
              />
            </label>
          </div>
          <div className="form-row three">
            <label>
              星期
              <select
                name="day"
                defaultValue={course?.day || parseDate(selected).getDay() || 7}
              >
                {weekdays.map((w, i) => (
                  <option value={i + 1} key={w}>
                    周{w}
                  </option>
                ))}
              </select>
            </label>
            <label>
              开始节次
              <select name="start" defaultValue={course?.start || 1}>
                {data.periods.map((p, i) => (
                  <option value={i + 1} key={i}>
                    {i + 1} · {p.start}
                  </option>
                ))}
              </select>
            </label>
            <label>
              结束节次
              <select
                name="end"
                defaultValue={course?.end || Math.min(2, data.periods.length)}
              >
                {data.periods.map((p, i) => (
                  <option value={i + 1} key={i}>
                    {i + 1} · {p.end}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            上课周次
            <input
              name="weeks"
              defaultValue={
                course ? course.weeks.join(",") : `1-${data.totalWeeks}`
              }
              placeholder="1-8,10,12-16"
              required
            />
            <small>支持范围和指定周次，例如 1-8,10,12-16</small>
          </label>
          <div className="segmented">
            {[
              { id: "all", name: "全部周次" },
              { id: "odd", name: "仅单周" },
              { id: "even", name: "仅双周" },
            ].map((m) => (
              <button
                type="button"
                key={m.id}
                className={mode === m.id ? "active" : ""}
                onClick={() => setMode(m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
          <label className="kind-input">
            课程类型（选填）
            <input
              name="kind"
              defaultValue={course?.kind || ""}
              maxLength={100}
              placeholder="如：线上课程、劳动实践"
            />
          </label>
          <fieldset className="color-field">
            <legend>课程颜色</legend>
            <div className="color-options">
              {colors.map((c, i) => (
                <button
                  aria-label={
                    ["鼠尾草绿", "雾蓝", "浅杏", "淡紫", "麦黄", "柔粉"][i]
                  }
                  aria-pressed={color === c}
                  type="button"
                  key={c}
                  className={c}
                  onClick={() => setColor(c)}
                >
                  {color === c && <Check size={20} />}
                </button>
              ))}
            </div>
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            {course && (
              <button
                type="button"
                className="delete-button"
                disabled={busy}
                onClick={() => onDelete(course.id)}
              >
                <Trash2 size={17} />
                删除
              </button>
            )}
            <button className="primary" disabled={busy} type="submit">
              <Check size={18} />
              {busy ? "保存中…" : "保存课程"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function SettingsForm({
  data,
  busy,
  onSave,
}: {
  data: Data;
  busy: boolean;
  onSave: (d: Data) => Promise<void>;
}) {
  const [periods, setPeriods] = useState(data.periods),
    [error, setError] = useState("");
  useEffect(() => setPeriods(data.periods), [data.periods]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const next = validateData({
        ...data,
        semester: String(f.get("semester")),
        totalWeeks: Number(f.get("totalWeeks")),
        termLabel: String(f.get("termLabel") || ""),
        periods,
      });
      await onSave(next);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message}。修改设置时，请先调整受影响的课程。`
          : "设置无效",
      );
    }
  }
  return (
    <form className="settings-card" onSubmit={submit}>
      <h2>
        <CalendarDays size={19} />
        学期与作息
      </h2>
      <label>
        学年学期名称
        <input
          key={data.termLabel}
          name="termLabel"
          defaultValue={data.termLabel || ""}
          maxLength={100}
          placeholder="例如：2026—2027 第 1 学期"
        />
      </label>
      <div className="form-row">
        <label>
          学期开始日期
          <input
            key={data.semester}
            name="semester"
            type="date"
            defaultValue={data.semester}
            required
          />
        </label>
        <label>
          教学周数
          <input
            key={data.totalWeeks}
            name="totalWeeks"
            type="number"
            min={1}
            max={60}
            defaultValue={data.totalWeeks}
            required
          />
        </label>
      </div>
      <p>开始日期所在的周一至周日记为第 1 周，单双周以教学周编号计算。</p>
      <div className="period-heading">
        <h3>节次时间</h3>
        <span>24 小时制</span>
      </div>
      <div className="period-list">
        {periods.map((p, i) => (
          <div className="period-row" key={i}>
            <span>第 {i + 1} 节</span>
            <input
              type="time"
              aria-label={`第${i + 1}节开始时间`}
              required
              value={p.start}
              onChange={(e) =>
                setPeriods(
                  periods.map((x, j) =>
                    j === i ? { ...x, start: e.target.value } : x,
                  ),
                )
              }
            />
            <span>—</span>
            <input
              type="time"
              aria-label={`第${i + 1}节结束时间`}
              required
              value={p.end}
              onChange={(e) =>
                setPeriods(
                  periods.map((x, j) =>
                    j === i ? { ...x, end: e.target.value } : x,
                  ),
                )
              }
            />
          </div>
        ))}
      </div>
      <div className="period-tools">
        <button
          type="button"
          className="text-btn"
          disabled={periods.length >= 20}
          onClick={() => {
            const last = periods[periods.length - 1];
            const [h, m] = last.end.split(":").map(Number),
              n = h * 60 + m + 10;
            const t = (v: number) =>
              `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
            if (n + 45 >= 1440) {
              setError("当天已没有足够的时间添加节次");
              return;
            }
            setPeriods([...periods, { start: t(n), end: t(n + 45) }]);
          }}
        >
          <Plus size={15} />
          增加节次
        </button>
        <button
          type="button"
          className="text-btn"
          disabled={periods.length <= 1}
          onClick={() => setPeriods(periods.slice(0, -1))}
        >
          移除末节
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy}>
        保存设置
      </button>
    </form>
  );
}
export default App;
