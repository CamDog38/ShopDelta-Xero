"use client";

import React, { useMemo, useState } from "react";

export type ProductOption = { id: string; title: string };

type Props = {
  name?: string; // query string key, default: "products"
  options: ProductOption[];
  selected?: string[]; // selected ids
};

export default function ProductMultiSelect({ name = "products", options, selected = [] }: Props) {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState<string[]>(selected);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) =>
      (o.title || o.id).toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
    );
  }, [options, query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
      <label className="text-12">Products</label>
      <input
        type="text"
        placeholder="Search products..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
      />
      <select
        multiple
        name={name}
        value={value}
        onChange={(e) => {
          const sel = Array.from(e.target.selectedOptions).map((o) => o.value);
          setValue(sel);
        }}
        size={8}
        style={{ padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }}
      >
        {filtered.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </select>
      {/* Ensure selected values submit even if filtered out */}
      {value
        .filter((id) => !filtered.some((o) => o.id === id))
        .map((id) => (
          <input key={id} type="hidden" name={name} value={id} />
        ))}
    </div>
  );
}
