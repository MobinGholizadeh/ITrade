import type { ReactNode } from "react";

export function Field({
  label,
  value,
  onChange,
  hint,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  suffix?: string;
}) {
  return (
    <label className="risk-field">
      <span>
        {label}
        {suffix && (
          <>
            {" "}
            <small>{suffix}</small>
          </>
        )}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        placeholder="Enter value"
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="risk-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
export function formatAmount(value: string | null | undefined, places = 2) {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  if (num !== 0 && Math.abs(num) < 10 ** -places) return num.toPrecision(3);
  return num.toLocaleString(undefined, {
    maximumFractionDigits: places,
    minimumFractionDigits: places === 2 ? 2 : 0,
  });
}
