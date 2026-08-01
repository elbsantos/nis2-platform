/**
 * frontend/src/components/MoneyInput.tsx
 *
 * Input de dinheiro (euros inteiros) com máscara de milhares em tempo real.
 * `value`/`onChange` trabalham sempre com o valor PURO ("15000"); o campo
 * exibe o valor MASCARADO ("15.000"). Preserva a posição do cursor ao editar
 * no meio do número ou ao apagar.
 */

import { useRef, type ChangeEvent } from "react";
import { formatMilhares, parseMilhares } from "../lib/formatMilhares";

interface MoneyInputProps {
  id?: string;
  value: string; // valor puro, ex.: "15000"
  onChange: (pureDigits: string) => void;
  placeholder?: string;
  className?: string;
}

export function MoneyInput({ id, value, onChange, placeholder, className }: MoneyInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const input      = e.target;
    const rawValue    = input.value;
    const cursorPos   = input.selectionStart ?? rawValue.length;
    const digitsBeforeCursor = rawValue.slice(0, cursorPos).replace(/\D/g, "").length;

    const newPure   = parseMilhares(rawValue);
    const newMasked = formatMilhares(newPure);

    onChange(newPure);

    // Recoloca o cursor depois de o React re-renderizar com o novo valor mascarado.
    requestAnimationFrame(() => {
      if (!ref.current) return;
      let seen = 0;
      let pos  = 0;
      for (; pos < newMasked.length; pos++) {
        if (/\d/.test(newMasked[pos])) seen++;
        if (seen === digitsBeforeCursor) { pos++; break; }
      }
      ref.current.setSelectionRange(pos, pos);
    });
  }

  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode="numeric"
      value={formatMilhares(value)}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
}
