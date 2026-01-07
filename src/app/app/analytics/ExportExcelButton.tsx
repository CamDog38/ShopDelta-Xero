"use client";

import React, { useState } from "react";

type Props = {
  className?: string;
};

export default function ExportExcelButton({ className }: Props) {
  const [isExporting, setIsExporting] = useState(false);

  const exportWorkbook = async () => {
    try {
      setIsExporting(true);
      const form = document.getElementById("filters-form") as HTMLFormElement | null;
      const fd = form ? new FormData(form) : new FormData();

      const params = new URLSearchParams();
      for (const [k, v] of fd.entries()) {
        if (typeof v === "string" && v !== "") params.append(k, v);
      }
      params.set("format", "xlsx");

      const href = `/app/analytics/export?${params.toString()}`;
      const res = await fetch(href, { method: "GET", credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `analytics-${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={() => void exportWorkbook()}
      disabled={isExporting}
    >
      {isExporting ? "Exporting…" : "Export Excel"}
    </button>
  );
}
