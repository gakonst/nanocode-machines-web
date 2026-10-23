import { useEffect, useState, useSyncExternalStore } from "react";
import type * as Payments from "./payments.ts";
import * as styles from "./styles.ts";
import { format } from "./wallet.ts";

const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export type Source = Pick<Payments.Payments, "ledger" | "subscribe">;

export function useSpend(payments: Source, window: number) {
  const ledger = useSyncExternalStore(payments.subscribe, payments.ledger, payments.ledger);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const recent = ledger.services.flatMap(service => service.charges.filter(item => now - item.at < window));
  const rate = recent.reduce((sum, item) => sum + item.amount, 0n) * 60_000n / BigInt(window);
  const services = [...ledger.services].sort((a, b) => a.spent === b.spent ? 0 : a.spent > b.spent ? -1 : 1).map(service => ({ ...service, live: service.charges.some(item => now - item.at < 2000), spark: spark(service, now, window) }));
  return { ledger, rate, services };
}

export function Spend(props: { payments: Source; window: number }) {
  const { ledger, rate, services } = useSpend(props.payments, props.window);
  const width = Math.max(0, ...services.map(service => service.name.length));
  return (
    <div aria-label="Spend" {...styles.spend()}>
      <p {...styles.title()}><span {...styles.accent()}>⚡</span> {format(ledger.total)} MACH streamed · {ledger.calls} paid calls · {services.length} services · {format(rate)} MACH/min</p>
      {services.length === 0 && <p {...styles.empty()}>Nothing paid yet. Each service shows up here as it charges.</p>}
      {services.map(service => (
        <p key={service.name}>
          <span {...styles.dot({ live: service.live })}>●</span> {service.name.padEnd(width)} <span {...styles.spark()}>{service.spark}</span> {format(service.spent).padStart(10)} MACH <span {...styles.calls()}>{service.calls} calls</span>
        </p>
      ))}
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
