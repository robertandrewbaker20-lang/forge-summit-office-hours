"use client";

import { useEffect, useState } from "react";
import type { Board } from "@/lib/types";

export function BoardApp() {
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/getBoard", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      setData((await res.json()) as Board);
      setError(false);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 30000);
    return () => clearInterval(id);
  }, []);

  if (!data) {
    return (
      <div className="empty">{error ? "Could not load the board." : "Loading…"}</div>
    );
  }

  if (!data.hasToday) {
    return <div className="empty">No office hours scheduled today.</div>;
  }

  return (
    <>
      <header>
        <h1>Office hours</h1>
        <div className="sub">{data.room}</div>
        <div className="stamp">Updated {data.updated}</div>
      </header>
      <div className="band" />
      <table>
        <thead>
          <tr>
            <th></th>
            {data.times.map((t) => (
              <th key={t}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.agencies.map((ag) => (
            <tr
              key={ag.name}
              className={ag.type === "Cohort" ? "cohort" : "partner"}
            >
              <th>{ag.name}</th>
              {data.times.map((t) => {
                const status = ag.cells[t];
                if (status === "Open") {
                  return (
                    <td key={t}>
                      <span className="cell open">Open</span>
                    </td>
                  );
                }
                if (status === "Booked") {
                  return (
                    <td key={t}>
                      <span className="cell booked">{t}</span>
                    </td>
                  );
                }
                return (
                  <td key={t}>
                    <span className="cell none">&mdash;</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <footer>
        <div>
          <span className="key" />
          Open, scan the code at the table
        </div>
        <div>
          <span className="key off" />
          Booked
        </div>
        <div>
          <span className="key part" />
          Federal and state partners
        </div>
        <div>
          <span className="key coh" />
          Phoenix cohort
        </div>
      </footer>
    </>
  );
}
