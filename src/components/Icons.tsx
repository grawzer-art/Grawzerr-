import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconCore = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <circle cx="12" cy="12" r="7" strokeDasharray="3 2.5" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" />
  </svg>
);
export const IconDashboard = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
  </svg>
);
export const IconMemory = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 4.5a3 3 0 0 0-3 3v.2A3 3 0 0 0 4.5 13a3 3 0 0 0 2 4.6A2.9 2.9 0 0 0 12 18V6a2.5 2.5 0 0 0-3-1.5Z" />
    <path d="M15 4.5a3 3 0 0 1 3 3v.2A3 3 0 0 1 19.5 13a3 3 0 0 1-2 4.6A2.9 2.9 0 0 1 12 18" />
    <path d="M9 10h1.5M13.5 13H15" />
  </svg>
);
export const IconMissions = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3 4.5 6.5v5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5v-5Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);
export const IconMore = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="5.5" cy="12" r="1.3" />
    <circle cx="12" cy="12" r="1.3" />
    <circle cx="18.5" cy="12" r="1.3" />
  </svg>
);
export const IconCalendar = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);
export const IconPlug = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0Z" />
    <path d="M12 16.5V21" />
  </svg>
);
export const IconHistory = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
    <path d="M3.5 4v4.5H8M12 7.5V12l3 2" />
  </svg>
);
export const IconSettings = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
export const IconSend = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
export const IconStop = (p: P) => (
  <svg {...base} {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
  </svg>
);
export const IconMic = (p: P) => (
  <svg {...base} {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);
export const IconSpeaker = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
