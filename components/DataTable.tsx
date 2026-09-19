"use client";

import { useMemo, useState } from "react";

export interface Column<T> {
  key: keyof T | string;
  label: string;
  align?: "left" | "right";
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  rows,
  filename,
  emptyMessage = "Nothing to show for this range.",
}: {
  columns: Column<T>[];
  rows: T[];
  filename: string;
  emptyMessage?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => String(c.key) === sortKey);
    if (!col) return rows;
    const getVal = col.sortValue ?? ((r: T) => r[col.key as string]);
    return [...rows].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av === bv) return 0;
      return av > bv ? sortDir : -sortDir;
    });
  }, [rows, sortKey, sortDir, columns]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function exportCSV() {
    const header = columns.map((c) => c.label).join(",");
    const body = rows
      .map((r) =>
        columns
          .map((c) => {
            const raw = c.render ? undefined : r[c.key as string];
            const value = raw === undefined || raw === null ? "" : String(raw);
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows.length === 0) {
    return <div className="p-6 text-sm text-muted">{emptyMessage}</div>;
  }

  return (
    <div>
      <div className="flex justify-end px-4 pt-3">
        <button
          onClick={exportCSV}
          className="focus-ring rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-navy hover:border-navy-600"
        >
          Export CSV
        </button>
      </div>
      <div className="table-scroll px-4 pb-4 pt-2">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {columns.map((c) => (
                <th
                  key={String(c.key)}
                  className={`sticky top-0 bg-white py-2 pr-4 font-medium text-muted ${c.align === "right" ? "text-right" : "text-left"}`}
                >
                  <button
                    onClick={() => toggleSort(String(c.key))}
                    className="focus-ring inline-flex items-center gap-1 hover:text-navy"
                  >
                    {c.label}
                    {sortKey === String(c.key) && <span className="text-[10px]">{sortDir === 1 ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {sorted.map((row, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-mist">
                {columns.map((c) => (
                  <td key={String(c.key)} className={`py-2 pr-4 text-navy ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {c.render ? c.render(row) : row[c.key as string]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
