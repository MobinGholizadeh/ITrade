"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { HealthReport } from "@/domain/health";

const HealthContext = createContext<{
  report: HealthReport | null;
  connected: boolean;
}>({ report: null, connected: false });
export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let lastReceived = 0;
    const events = new EventSource("/api/events");
    events.addEventListener("health", (event) => {
      try {
        setReport(JSON.parse(event.data));
        lastReceived = Date.now();
        setConnected(true);
      } catch {
        setConnected(false);
      }
    });
    events.addEventListener("unavailable", () => setConnected(false));
    events.onerror = () => setConnected(false);
    const timer = setInterval(() => {
      if (Date.now() - lastReceived > 25000) setConnected(false);
    }, 5000);
    return () => {
      events.close();
      clearInterval(timer);
    };
  }, []);
  return (
    <HealthContext.Provider value={{ report, connected }}>
      {children}
    </HealthContext.Provider>
  );
}
export const useHealth = () => useContext(HealthContext);
