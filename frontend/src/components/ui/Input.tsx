import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const base =
  "w-full px-4 py-3 rounded-xl text-sm bg-field border border-line text-text placeholder:text-faint " +
  "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-colors";

/** Campo de texto tokenizado (escuro). Substitui os inputs bg-gray-50 repetidos. */
export function Input({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${base} ${className}`} {...rest} />;
}

/** Variante textarea, mesmo estilo. */
export function Textarea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${base} resize-none ${className}`} {...rest} />;
}
