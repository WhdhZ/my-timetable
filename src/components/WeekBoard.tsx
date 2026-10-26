import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Plus,
  Settings2,
  MapPin,
  UserRound,
  Clock3,
  CalendarDays,
  Pencil,
} from "lucide-react";
import {
  active,
  addDays,
  dateKey,
  monday,
  parseDate,
  teachingWeek,
  weekdays,
  type Course,
  type Data,
} from "../domain";
import { Modal } from "./Modal";
interface Group {
  courses: Course[];
  start: number;
  end: number;
  day: number;
  inactive: boolean;
}
export function boardGroups(
  courses: Course[],
  week: number,
  showInactive: boolean,
): Group[] {
  const groups: Group[] = [];
  for (let day = 1; day <= 7; day++) {
    for (const c of courses
      .filter((c) => c.day === day && active(c, week))
      .sort((a, b) => a.start - b.start)) {
      const previous = groups.at(-1);
      if (
        previous &&
        previous.day === day &&
        c.start <= previous.end &&
        !previous.inactive
      ) {
        previous.courses.push(c);
        previous.end = Math.max(previous.end, c.end);
      } else
        groups.push({
          courses: [c],
          start: c.start,
          end: c.end,
          day,
          inactive: false,
        });
    }
    if (showInactive)
      for (const c of courses
        .filter((c) => c.day === day && !active(c, week))
        .sort((a, b) => a.start - b.start)) {
        if (
          groups.some(
            (g) => g.day === day && g.start <= c.end && g.end >= c.start,
          )
        )
          continue;
        groups.push({
          courses: [c],
          start: c.start,
          end: c.end,
          day,
          inactive: true,
        });
      }
  }
  return groups;
}
export default function WeekBoard({
  data,
  selected,
  today,
  onDate,
  onEdit,
  onImport,
  onSettings,
  onPending,
}: {
  data: Data;
  selected: string;
  today: string;
  onDate: (s: string) => void;
  onEdit: (c: Course | null) => void;
  onImport: () => void;
  onSettings: () => void;
  onPending: () => void;
}) {
  const [showInactive, setShowInactive] = useState(false),
    [pick, setPick] = useState(false),
    [details, setDetails] = useState<Course[] | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null),
    date = parseDate(selected),
    start = monday(date),
    week = teachingWeek(date, data.semester);
  const groups = boardGroups(data.courses, week, showInactive);
  const shift = (n: number) => onDate(dateKey(addDays(date, n * 7)));
  const term =
    data.termLabel ||
    (() => {
      const d = parseDate(data.semester),
        year = d.getMonth() < 7 ? d.getFullYear() - 1 : d.getFullYear();
      return `${year}—${year + 1} 第 ${d.getMonth() < 7 ? 2 : 1} 学期`;
    })();
  return (
    <section className="timetable-home">
      <div className="board-heading">
        <div>
          <button
            className="week-picker-button"
            onClick={() => setPick(true)}
            aria-label="选择教学周"
          >
            {week < 1
              ? "尚未开学"
              : week > data.totalWeeks
                ? "学期已结束"
                : `第 ${week} 周`}
            <ChevronDown size={18} />
          </button>
          <p>
            {term}
            {!data.termLabel && (
              <span className="sr-only">
                （根据开学日期显示，可在设置修改）
              </span>
            )}
          </p>
        </div>
        <div className="board-actions">
          <button className="icon-btn" aria-label="导入课表" onClick={onImport}>
            <FileUp size={21} />
          </button>
          <button
            className="icon-btn"
            aria-label="课表设置"
            onClick={onSettings}
          >
            <Settings2 size={21} />
          </button>
          <button
            className="board-add"
            aria-label="添加课程"
            onClick={() => onEdit(null)}
          >
            <Plus size={23} />
          </button>
        </div>
      </div>
      <div className="board-controls">
        <div>
          <button
            className="icon-btn"
            aria-label="上一周"
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button className="back-current" onClick={() => onDate(today)}>
            回到本周
          </button>
          <button
            className="icon-btn"
            aria-label="下一周"
            onClick={() => shift(1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <label className="inactive-toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          显示非本周
        </label>
      </div>
      {!groups.length && (
        <div className="board-empty">
          <CalendarDays size={24} />
          <div>
            <strong>这一周，留白也很好</strong>
            <p>添加课程，或导入 PDF 课表。</p>
          </div>
          <button className="text-btn" onClick={onImport}>
            导入我的课表
          </button>
        </div>
      )}
      <div
        className="board-swipe"
        onTouchStart={(e) => {
          if (e.touches.length === 1)
            touch.current = {
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
            };
        }}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t || !e.changedTouches.length) return;
          const dx = e.changedTouches[0].clientX - t.x,
            dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8)
            shift(dx < 0 ? 1 : -1);
        }}
      >
        <div
          className="seven-grid"
          style={{
            gridTemplateRows: `58px repeat(${data.periods.length}, var(--period-height))`,
          }}
        >
          <div className="board-month">
            {start.getMonth() + 1}
            <small>月</small>
          </div>
          {weekdays.map((w, i) => {
            const day = addDays(start, i),
              isToday = dateKey(day) === today;
            return (
              <button
                className={`board-day ${isToday ? "today" : ""}`}
                key={w}
                style={{ gridColumn: i + 2, gridRow: 1 }}
                onClick={() => onDate(dateKey(day))}
                aria-label={`${day.getMonth() + 1}月${day.getDate()}日 星期${w}`}
              >
                <span>{w}</span>
                <b>{day.getDate()}</b>
                {day.getDate() === 1 && <small>{day.getMonth() + 1}月</small>}
              </button>
            );
          })}
          {data.periods.map((p, i) => (
            <div
              key={i}
              className="board-period"
              style={{ gridRow: i + 2, gridColumn: 1 }}
            >
              <b>{i + 1}</b>
              <span>{p.start}</span>
              <span>{p.end}</span>
            </div>
          ))}
          {data.periods.flatMap((_, i) =>
            weekdays.map((day, j) => (
              <div
                className={`board-cell ${dateKey(addDays(start, j)) === today ? "today-column" : ""}`}
                key={`${i}-${day}`}
                style={{ gridRow: i + 2, gridColumn: j + 2 }}
              />
            )),
          )}
          {groups.map((g, index) => {
            const c = g.courses[0],
              conflict = g.courses.length > 1;
            return (
              <button
                key={`${index}-${c.id}`}
                className={`board-course ${c.color} ${g.inactive ? "not-this-week" : ""} ${conflict ? "has-conflict" : ""}`}
                style={{
                  gridColumn: g.day + 1,
                  gridRow: `${g.start + 1} / ${g.end + 2}`,
                }}
                onClick={() => setDetails(g.courses)}
                aria-label={`${c.name}，周${weekdays[c.day - 1]}，${g.start}至${g.end}节${conflict ? `，${g.courses.length}门课程重叠` : ""}${g.inactive ? "，非本周" : ""}`}
              >
                <span className="card-color-edge" />
                {g.inactive && <span className="inactive-label">非本周</span>}
                {conflict && (
                  <span className="overlap-count">
                    {g.courses.length} 门冲突
                  </span>
                )}
                <strong>
                  {conflict ? g.courses.map((c) => c.name).join(" / ") : c.name}
                </strong>
                <span className="board-room">{c.room || "地点待定"}</span>
                {c.kind && <small className="board-kind">{c.kind}</small>}
              </button>
            );
          })}
        </div>
      </div>
      {(data.otherCourses?.length || 0) > 0 && (
        <button className="pending-banner" onClick={onPending}>
          {data.otherCourses!.length} 门其他／待确认课程 · 点击核对
          <ChevronRight size={15} />
        </button>
      )}
      <p className="board-hint">左右滑动切换周次 · 点击课程查看详情</p>
      {pick && (
        <Modal title="选择教学周" onClose={() => setPick(false)}>
          <div className="week-picker-grid">
            {Array.from({ length: data.totalWeeks }, (_, i) => i + 1).map(
              (w) => (
                <button
                  key={w}
                  className={week === w ? "current" : ""}
                  onClick={() => {
                    onDate(
                      dateKey(
                        addDays(monday(parseDate(data.semester)), (w - 1) * 7),
                      ),
                    );
                    setPick(false);
                  }}
                >
                  第 {w} 周
                </button>
              ),
            )}
          </div>
          <p className="picker-note">
            学期开始：{data.semester} · 开始日期所在自然周为第 1 周
          </p>
        </Modal>
      )}
      {details && (
        <Modal
          title={details.length > 1 ? "冲突课程 · 请核对安排" : "课程详情"}
          onClose={() => setDetails(null)}
        >
          <div className="course-details-list">
            {details.map((c) => (
              <article key={c.id} className={`detail-card ${c.color}`}>
                <h3>{c.name}</h3>
                {!active(c, week) && (
                  <span className="detail-inactive">非本周课程</span>
                )}
                <p>
                  <Clock3 size={16} />周{weekdays[c.day - 1]} · 第 {c.start}–
                  {c.end} 节 · {data.periods[c.start - 1].start}–
                  {data.periods[c.end - 1].end}
                </p>
                <p>
                  <MapPin size={16} />
                  {c.room || "上课地点待确认"}
                </p>
                <p>
                  <UserRound size={16} />
                  {c.teacher || "任课教师待确认"}
                </p>
                <p className="detail-weeks">
                  <CalendarDays size={16} />第 {c.weeks.join("、")} 周
                </p>
                {c.kind && <p>课程类型：{c.kind}</p>}
                {c.sourceText && (
                  <details className="source-text">
                    <summary>查看导入原文</summary>
                    <pre>{c.sourceText}</pre>
                  </details>
                )}
                <button
                  className="secondary"
                  onClick={() => {
                    setDetails(null);
                    onEdit(c);
                  }}
                >
                  <Pencil size={15} />
                  编辑课程
                </button>
              </article>
            ))}
          </div>
          {details.length > 1 && (
            <p className="picker-note">
              上方保留所有重叠课程。跨节长度按整个冲突区间显示，准确节次见各课程详情。
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
