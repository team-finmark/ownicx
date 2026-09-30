"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

export function Toast({ state }: { state: ActionState }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!state) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, [state]);
  if (!state || !visible) return null;
  return (
    <div className={`toast${state.ok ? "" : " err"}`} role="status">
      {state.message}
    </div>
  );
}

/**
 * Page-wide toast for actions whose button disappears after the page refreshes
 * (e.g. Launch → "live", Remove member). Mounted once in the dashboard layout.
 */
const TOAST_EVENT = "ownicx:toast";
export function showToast(state: ActionState) {
  if (state) window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: state }));
}
export function GlobalToast() {
  const [state, setState] = useState<ActionState>(null);
  useEffect(() => {
    const on = (e: Event) => setState({ ...(e as CustomEvent<NonNullable<ActionState>>).detail });
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);
  return <Toast state={state} />;
}

export function ActionForm({
  action,
  children,
  className,
  style,
  resetOnSuccess,
  onSuccess,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    onSuccessRef.current?.();
  }, [state, resetOnSuccess]);
  return (
    <form
      action={formAction}
      className={className}
      style={style}
      ref={ref}
    >
      {children}
      <Toast state={state} />
    </form>
  );
}

export function Submit({ children, className = "btn primary", disabled }: { children: ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? "Working…" : children}
    </button>
  );
}

/** Optimistic on/off switch bound to a server action. */
export function LiveSwitch({
  checked,
  onToggle,
  label,
  confirmOn,
}: {
  checked: boolean;
  onToggle: (v: boolean) => Promise<void>;
  label: string;
  /** Asked before switching ON; cancelling leaves it off. */
  confirmOn?: string;
}) {
  const [on, setOn] = useState(checked);
  const [, start] = useTransition();
  useEffect(() => setOn(checked), [checked]);
  return (
    <label className="switch" title={label}>
      <input
        type="checkbox"
        aria-label={label}
        checked={on}
        onChange={(e) => {
          const v = e.target.checked;
          if (v && confirmOn && !window.confirm(confirmOn)) return;
          setOn(v);
          start(() => onToggle(v));
        }}
      />
      <span />
    </label>
  );
}

/** Small button that fires a bound server action (no form fields needed). */
/** Button that fires a bound server action; a returned ActionState is shown as a toast. */
export function ActionButton({
  action,
  children,
  className = "btn sm",
  confirm,
}: {
  action: () => Promise<ActionState | void>;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            try {
              const r = await action();
              if (r) showToast(r);
            } catch {
              showToast({ ok: false, message: "That didn't work. Please try again." });
            }
          });
        }}
      >
        {pending ? "…" : children}
      </button>
    </>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
