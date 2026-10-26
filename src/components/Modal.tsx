import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className={`modern-modal ${wide ? "wide" : ""}`}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) {
          const r = ref.current!.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close.current();
        }
      }}
    >
      <div className="modern-modal-header">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="关闭窗口"
          disabled={busy}
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
