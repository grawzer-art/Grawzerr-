import { MODULES, MODULE_STATE_LABEL, type ModuleInfo } from "@/lib/modules";

const VARIANT = { ready: "ok", experimental: "warn", planned: "off" } as const;

export default function ModuleList({ filter }: { filter?: (m: ModuleInfo) => boolean }) {
  const items = filter ? MODULES.filter(filter) : MODULES;
  return (
    <ul className="list">
      {items.map((m) => (
        <li key={m.name}>
          <div className="row">
            <span>{m.name}</span>
            <span className="badge" data-variant={VARIANT[m.state]}>
              {MODULE_STATE_LABEL[m.state]}
            </span>
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>
            Phase {m.phase} · {m.detail}
          </div>
        </li>
      ))}
    </ul>
  );
}
