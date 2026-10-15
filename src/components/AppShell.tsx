"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  IconCalendar,
  IconCore,
  IconDashboard,
  IconHistory,
  IconMemory,
  IconMissions,
  IconMore,
  IconPlug,
  IconSettings,
} from "./Icons";

const PRIMARY = [
  { href: "/", label: "JARVIS", Icon: IconCore },
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/memoire", label: "Mémoire", Icon: IconMemory },
  { href: "/missions", label: "Missions", Icon: IconMissions },
];

const SECONDARY = [
  { href: "/agenda", label: "Agenda & rappels", Icon: IconCalendar },
  { href: "/connexions", label: "Connexions", Icon: IconPlug },
  { href: "/historique", label: "Historique", Icon: IconHistory },
  { href: "/parametres", label: "Paramètres", Icon: IconSettings },
];

const TITLES: Record<string, string> = Object.fromEntries(
  [...PRIMARY, ...SECONDARY].map((i) => [i.href, i.label]),
);

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const [moreOpen, setMoreOpen] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const inSecondary = SECONDARY.some((i) => i.href === pathname);

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">J.A.R.V.I.S</span>
        <span className="topbar-title">{pathname === "/" ? "" : TITLES[pathname] ?? ""}</span>
        <span className="status-dot" data-state={online ? "ok" : "warn"}>
          {online ? "En ligne" : "Hors ligne"}
        </span>
      </header>

      {children}

      {moreOpen && (
        <>
          <div className="backdrop" onClick={() => setMoreOpen(false)} />
          <nav className="more-sheet" aria-label="Autres écrans">
            {SECONDARY.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
              >
                <Icon />
                {label}
              </Link>
            ))}
          </nav>
        </>
      )}

      <nav className="tabbar" aria-label="Navigation principale">
        {PRIMARY.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="tab"
            aria-current={pathname === href ? "page" : undefined}
            onClick={() => setMoreOpen(false)}
          >
            <Icon />
            {label}
          </Link>
        ))}
        <button
          type="button"
          className="tab"
          aria-current={inSecondary ? "page" : undefined}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <IconMore />
          Plus
        </button>
      </nav>
    </div>
  );
}
