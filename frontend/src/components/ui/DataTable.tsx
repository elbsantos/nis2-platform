import { Fragment } from "react";
import type { ReactNode } from "react";

export interface ColumnDef<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T extends { id: number }> {
  columns: ColumnDef<T>[];
  rows: T[];
  expandedId: number | null;
  onToggle: (id: number) => void;
  renderExpanded?: (row: T) => ReactNode;
  emptyMessage?: string;
}

export function DataTable<T extends { id: number }>({
  columns,
  rows,
  expandedId,
  onToggle,
  renderExpanded,
  emptyMessage = "Sem itens",
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">{emptyMessage}</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#1e3a5f]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-[#0f1e38] border-b border-[#1e3a5f]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-2.5 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
            <th className="py-2.5 px-2 w-6" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = expandedId === row.id;
            return (
              <Fragment key={row.id}>
                <tr
                  onClick={() => onToggle(row.id)}
                  className="border-b border-[#1e3a5f] hover:bg-[#152744] cursor-pointer transition-colors last:border-0"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-2.5 px-3 align-middle ${col.className ?? ""}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                  <td className="py-2.5 px-2 text-slate-500 text-xs align-middle select-none">
                    {isOpen ? "▲" : "▼"}
                  </td>
                </tr>
                {isOpen && renderExpanded && (
                  <tr className="border-b border-[#1e3a5f] bg-[#0b1526]">
                    <td colSpan={columns.length + 1} className="px-5 py-4">
                      {renderExpanded(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
