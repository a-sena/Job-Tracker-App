import { useId } from "react";

interface RolevyaLogoProps {
  inverse?: boolean;
  showDescriptor?: boolean;
  wordmarkClassName?: string;
}

/** Rolevya's reusable brand lockup: a bright career path ending in a successful step. */
export default function RolevyaLogo({
  inverse = false,
  showDescriptor = false,
  wordmarkClassName = "",
}: RolevyaLogoProps): JSX.Element {
  const gradientId = `rolevya-mark-${useId().replace(/:/g, "")}`;

  return (
    <span className="inline-flex items-center gap-3">
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        className="h-11 w-11 shrink-0 overflow-visible drop-shadow-[0_5px_9px_rgba(81,73,214,0.24)]"
      >
        <defs>
          <linearGradient id={gradientId} x1="7" y1="5" x2="42" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3f76f6" />
            <stop offset="0.55" stopColor="#6554e8" />
            <stop offset="1" stopColor="#9b4fd0" />
          </linearGradient>
        </defs>
        <rect
          x="2"
          y="2"
          width="44"
          height="44"
          rx="15"
          fill={`url(#${gradientId})`}
        />
        <path
          d="M11.5 34.5c4.4 0 5.15-8.6 10-8.6 4.35 0 4.25 5.05 8.15 5.05 4.25 0 4.1-9.55 7.1-13.15"
          fill="none"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.35"
        />
        <circle cx="11.5" cy="34.5" r="3.4" fill="#ff7968" stroke="#ffffff" strokeWidth="1.6" />
        <circle cx="21.5" cy="25.9" r="3.25" fill="#ffffff" />
        <circle cx="29.65" cy="30.95" r="3.25" fill="#ffffff" />
        <circle cx="37.25" cy="16.25" r="6" fill="#ffda58" />
        <path
          d="m34.65 16.35 1.7 1.65 3.55-3.85"
          fill="none"
          stroke="#5149d6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.85"
        />
      </svg>

      <span className={wordmarkClassName}>
        <span
          className={`block text-[20px] font-black leading-none tracking-[-0.045em] ${
            inverse ? "text-white" : "text-[#26253f]"
          }`}
        >
          Rolevya
        </span>
        {showDescriptor ? (
          <span
            className={`mt-1.5 block text-[9px] font-extrabold uppercase tracking-[0.18em] ${
              inverse ? "text-blue-100" : "text-[#777e8c]"
            }`}
          >
            Career workspace
          </span>
        ) : null}
      </span>
    </span>
  );
}
