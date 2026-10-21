import { useEffect, useState, useSyncExternalStore } from "react";
import type * as Payments from "./payments.ts";
import { format } from "./wallet.ts";

const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export function Spend(props: { payments: Payments.Payments; window: number }) {
  const { payments, window } = props;
  const ledger = useSyncExternalStore(payments.subscribe, payments.ledger, payments.ledger);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const recent = ledger.services.flatMap(service => service.charges.filter(item => now - item.at < window));
  const rate = recent.reduce((sum, item) => sum + item.amount, 0n) * 60_000n / BigInt(window);
  const services = [...ledger.services].sort((a, b) => a.spent === b.spent ? 0 : a.spent > b.spent ? -1 : 1);
  const width = Math.max(0, ...services.map(service => service.name.length));
  return (
    <div aria-label="Spend" className="spend">
      <p className="spend-title"><span className="spend-accent">⚡</span> {format(ledger.total)} MACH streamed · {ledger.calls} paid calls · {services.length} services · {format(rate)} MACH/min</p>
      {services.length === 0 && <p className="spend-empty">Nothing paid yet. Each service shows up here as it charges.</p>}
      {services.map(service => {
        const live = service.charges.some(item => now - item.at < 2000);
        return (
          <p className="spend-row" key={service.name}>
            <span className={live ? "spend-dot spend-dot-live" : "spend-dot"}>●</span> {service.name.padEnd(width)} <span className="spend-spark">{spark(service, now, window)}</span> {format(service.spent).padStart(10)} MACH <span className="spend-calls">{service.calls} calls</span>
          </p>
        );
      })}
    </div>
  );
}

function spark(service: Payments.Service, now: number, window: number) {
  const columns = Math.round(window / 1000);
  const buckets = Array.from({ length: columns }, () => 0n);
  for (const item of service.charges) {
    const age = Math.floor((now - item.at) / 1000);
    if (age >= 0 && age < columns) buckets[columns - 1 - age]! += item.amount;
  }
  const top = buckets.reduce((max, value) => value > max ? value : max, 0n);
  return buckets.map(value => value === 0n || top === 0n ? " " : bars[Math.min(bars.length - 1, Number(value * BigInt(bars.length) / (top + 1n)))]).join("");
}
