import React from 'react';

export function NexusLogo({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Intersection road cross */}
      <path
        d="M14 3H22V14H33V22H22V33H14V22H3V14H14V3Z"
        className="fill-slate-200 dark:fill-slate-800 stroke-slate-300 dark:stroke-slate-700"
        strokeWidth="1.2"
      />
      {/* Connected AI neural links */}
      <path
        d="M9 18H27M18 9V27M11.5 11.5L24.5 24.5M24.5 11.5L11.5 24.5"
        stroke="#06B6D4"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* Outer junction sensor nodes */}
      <circle cx="18" cy="7.5" r="2.2" fill="#10B981" />
      <circle cx="18" cy="28.5" r="2.2" fill="#10B981" />
      <circle cx="7.5" cy="18" r="2.2" fill="#06B6D4" />
      <circle cx="28.5" cy="18" r="2.2" fill="#06B6D4" />
      {/* Central RL controller hub */}
      <circle cx="18" cy="18" r="3.8" className="fill-cyan-500 stroke-white dark:stroke-slate-950" strokeWidth="1.5" />
    </svg>
  );
}
