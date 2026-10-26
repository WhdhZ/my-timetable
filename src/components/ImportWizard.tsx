import { useEffect, useRef, useState } from "react";
import {
  FileUp,
  ShieldCheck,
  Copy,
  Plus,
  Check,
  AlertCircle,
} from "lucide-react";
import { Modal } from "./Modal";
import { candidateIssues, prepareImport } from "../imports/merge";
import { conflicts, weekdays, type Data } from "../domain";
import type { ImportCandidate, ImportResult } from "../imports/types";
import { parseSchoolWeeks } from "../imports/weeks";
export default function ImportWizard({
  data,
  onClose,
  onCommit,
  initial,
}: {
  data: Data;
  onClose: () => void;
  onCommit: (d: Data, summary: string) => Promise<boolean>;
  initial?: ImportResult;
}) {
  const [result, setResult] = useState<ImportResult | null>(initial || null),
    [rows, setRows] = useState<ImportCandidate[]>(initial?.candidates || []),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState<"merge" | "replace">("merge"),
    [term, setTerm] = useState(initial?.termLabel || data.termLabel || ""),
    [checked, setChecked] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const update = (id: string, patch: Partial<ImportCandidate>) => {
    setRows((r) => r.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setChecked(false);
  };
  async function read(file?: File) {
    if (!file) return;
    setError("");
    setResult(null);
    setRows([]);
    setChecked(false);
    setLoading(true);
    const ac = new AbortController();
    controller.current = ac;
    try {
      const { pdfSource } = await import("../imports/pdf");
      const parsed = await pdfSource.parse(file, ac.signal);
      if (ac.signal.aborted) return;
      setResult(parsed);
      setRows(parsed.candidates);
      setTerm(parsed.termLabel || data.termLabel || "");
    } catch (e) {
      if (!ac.signal.aborted)
        setError(
          e instanceof Error
            ? `读取失败：${e.message}。请确认 PDF 可复制文字、未加密。`
            : "无法读取 PDF",
        );
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }
  const selected = rows.filter((r) => r.include);
  const pending = selected.filter(
    (r) => candidateIssues(r, data).length,
  ).length;
  let preview: ReturnType<typeof prepareImport> | null = null;
  let previewError = "";
  try {
    if (result) {
      const base = initial
        ? {
            ...data,
            otherCourses: (data.otherCourses || []).filter(
              (c) => !selected.some((r) => r.id === c.id),
            ),
          }
        : data;
      preview = prepareImport(base, result, rows, mode, term);
    }
  } catch (e) {
    previewError = (e as Error).message;
  }
  const conflictPairs = preview
    ? preview.data.courses.reduce(
        (n, c, i) =>
          n +
          preview!.data.courses.slice(i + 1).filter((b) => conflicts(c, b))
            .length,
        0,
      )
    : 0;
  async function finish() {
    if (!result || !checked || !preview || !selected.length) return;
    setSaving(true);
    setError("");
    try {
      const success = await onCommit(
        preview.data,
        `已新增 ${preview.added} 个上课安排，保留 ${preview.pending} 门待确认课程，跳过 ${preview.duplicates} 项重复`,
      );
      if (success) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={initial ? "核对其他／待确认课程" : "导入课表 · 北京农学院 PDF"}
      wide
      onClose={() => {
        controller.current?.abort();
        onClose();
      }}
      busy={saving}
    >
      <div className="import-privacy">
        <ShieldCheck size={17} />
        <span>在这台设备解析，PDF 不会上传，也不会保存原文件。</span>
      </div>
      {!initial && (
        <div className="pdf-picker">
          <FileUp size={30} strokeWidth={1.4} />
          <div>
            <strong>
              {loading ? "正在读取和定位课程…" : "选择教学系统导出的学期课表"}
            </strong>
            <p>支持可复制文字的 PDF · 最大 20 MB / 30 页</p>
          </div>
          <button
            className="secondary"
            disabled={loading || saving}
            onClick={() => fileRef.current?.click()}
          >
            {result ? "重新选择" : "选择 PDF"}
          </button>
          <input
            hidden
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => {
              void read(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          <div className="import-overview">
            <div>
              <strong>{rows.length}</strong>
              <span>识别候选</span>
            </div>
            <div>
              <strong>{selected.length - pending}</strong>
              <span>时间完整</span>
            </div>
            <div>
              <strong>{pending}</strong>
              <span>待确认</span>
            </div>
            <div>
              <strong>{preview?.duplicates || 0}</strong>
              <span>重复项</span>
            </div>
          </div>
          <div className="import-caution">
            <AlertCircle size={18} />
            <div>
              <strong>请对照原 PDF 核对后导入</strong>
              <p>
                版式识别可能有误。展开每门课可修改、复制拆分或取消导入。时间或周次不完整的内容会保留为待确认，不进入网格。未自动推测开学日期或上下课钟点。
              </p>
              {result.warnings.map((w, i) => (
                <p key={i}>• {w}</p>
              ))}
            </div>
          </div>
          <label>
            学年学期（可修改）
            <input
              value={term}
              maxLength={100}
              placeholder="例如：2026—2027 第 1 学期"
              onChange={(e) => {
                setTerm(e.target.value);
                setChecked(false);
              }}
            />
          </label>
          <div className="import-list">
            {rows.map((row, index) => {
              const issues = candidateIssues(row, data);
              let weeks: number[] = [];
              try {
                weeks = parseSchoolWeeks(row.weekText);
              } catch {
                /* 预览保留无效原文 */
              }
              return (
                <details
                  key={row.id}
                  className={`import-row ${!row.include ? "excluded" : ""}`}
                >
                  <summary>
                    <span className="candidate-number">{index + 1}</span>
                    <div>
                      <strong>{row.name || "未填写课程名"}</strong>
                      <p>
                        {row.day ? `周${weekdays[row.day - 1]}` : "星期待定"} ·{" "}
                        {row.start && row.end
                          ? `${row.start}–${row.end} 节`
                          : "节次待定"}{" "}
                        · {row.room || "地点待定"}
                      </p>
                      <small>
                        {row.weekText || "周次待定"}
                        {row.teacher ? ` · ${row.teacher}` : ""}
                      </small>
                    </div>
                    <span
                      className={`candidate-badge ${issues.length ? "warning" : ""}`}
                    >
                      {!row.include
                        ? "不导入"
                        : issues.length
                          ? "待确认"
                          : "可导入"}
                    </span>
                  </summary>
                  <div className="candidate-edit">
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) =>
                          update(row.id, { include: e.target.checked })
                        }
                      />
                      导入此项
                    </label>
                    <label>
                      课程名称
                      <input
                        value={row.name}
                        maxLength={80}
                        onChange={(e) =>
                          update(row.id, { name: e.target.value })
                        }
                      />
                    </label>
                    <div className="form-row">
                      <label>
                        教室／地点
                        <input
                          value={row.room}
                          maxLength={100}
                          onChange={(e) =>
                            update(row.id, { room: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        任课教师
                        <input
                          value={row.teacher}
                          maxLength={80}
                          onChange={(e) =>
                            update(row.id, { teacher: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="form-row three">
                      <label>
                        星期
                        <select
                          value={row.day || 0}
                          onChange={(e) =>
                            update(row.id, {
                              day: Number(e.target.value) || null,
                            })
                          }
                        >
                          <option value={0}>未确定</option>
                          {weekdays.map((w, i) => (
                            <option key={w} value={i + 1}>
                              周{w}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        开始节次
                        <input
                          inputMode="numeric"
                          type="number"
                          min={1}
                          max={20}
                          value={row.start ?? ""}
                          onChange={(e) =>
                            update(row.id, {
                              start: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                        />
                      </label>
                      <label>
                        结束节次
                        <input
                          inputMode="numeric"
                          type="number"
                          min={1}
                          max={20}
                          value={row.end ?? ""}
                          onChange={(e) =>
                            update(row.id, {
                              end: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      上课周次
                      <input
                        value={row.weekText}
                        maxLength={500}
                        placeholder="3-5周(单),6-18周"
                        onChange={(e) =>
                          update(row.id, { weekText: e.target.value })
                        }
                      />
                      <small>
                        {weeks.length
                          ? `实际周次：${weeks.join("、")}`
                          : "尚未得到有效上课周次"}
                      </small>
                    </label>
                    <label className="kind-input">
                      特殊类型
                      <input
                        value={row.kind}
                        maxLength={100}
                        placeholder="如：军训、劳动实践、线上课程"
                        onChange={(e) =>
                          update(row.id, { kind: e.target.value })
                        }
                      />
                    </label>
                    {issues.length > 0 && (
                      <p className="form-error">{issues.join("；")}</p>
                    )}
                    {row.warnings.length > 0 && (
                      <div className="source-warnings">
                        识别提示：{row.warnings.join("；")}
                      </div>
                    )}
                    <details className="source-text">
                      <summary>查看此项 PDF 原文</summary>
                      <pre>{row.raw}</pre>
                    </details>
                    <button
                      className="text-btn"
                      onClick={() => {
                        setRows((r) => [
                          ...r,
                          {
                            ...row,
                            id: crypto.randomUUID(),
                            warnings: [
                              "从原项复制，请分别调整周次、教师或地点",
                            ],
                          },
                        ]);
                        setChecked(false);
                      }}
                    >
                      <Copy size={14} />
                      复制此项以拆分不同安排
                    </button>
                  </div>
                </details>
              );
            })}
          </div>
          <button
            className="text-btn"
            onClick={() => {
              setRows((r) => [
                ...r,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  room: "",
                  teacher: "",
                  day: null,
                  start: null,
                  end: null,
                  weeks: [],
                  weekText: "",
                  kind: "",
                  raw: "手动补充",
                  warnings: [],
                  include: true,
                },
              ]);
              setChecked(false);
            }}
          >
            <Plus size={15} />
            补充遗漏课程
          </button>
          {!initial && (
            <fieldset className="import-mode">
              <legend>导入方式</legend>
              <label>
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "merge"}
                  onChange={() => {
                    setMode("merge");
                    setChecked(false);
                  }}
                />
                合并到现有课表
                <small>按名称、教师、地点、星期、节次和周次去重</small>
              </label>
              <label>
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "replace"}
                  onChange={() => {
                    setMode("replace");
                    setChecked(false);
                  }}
                />
                替换当前课表
                <small>包含其他课程；导入前自动备份，可在设置中恢复</small>
              </label>
            </fieldset>
          )}
          {conflictPairs > 0 && (
            <p className="notice">
              导入后有 {conflictPairs}{" "}
              组冲突，将在课表中并列显示，请核对调课信息。
            </p>
          )}
          {previewError && (
            <p className="form-error" role="alert">
              {previewError}
            </p>
          )}
          {selected.length > 0 && (
            <label className="check-label review-check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              我已核对识别结果。
              {pending ? `${pending} 门待确认课程将单独保存，不猜测时间。` : ""}
            </label>
          )}
          <div className="import-confirm">
            <small>保留现有节次时间和学期开始日期</small>
            <button
              className="primary"
              disabled={!checked || !selected.length || !preview || saving}
              onClick={finish}
            >
              <Check size={17} />
              {saving ? "正在保存…" : "确认导入"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
