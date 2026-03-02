import type { ReactElement } from 'react';
import type { WeatherCondition } from '../types';

interface Props {
  condition: WeatherCondition;
  size?: number;
  className?: string;
}

const icons: Record<WeatherCondition, (size: number) => ReactElement> = {
  clear: (s) => (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="14" fill="#FF6B2B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line
          key={a}
          x1={32 + Math.cos((a * Math.PI) / 180) * 18}
          y1={32 + Math.sin((a * Math.PI) / 180) * 18}
          x2={32 + Math.cos((a * Math.PI) / 180) * 28}
          y2={32 + Math.sin((a * Math.PI) / 180) * 28}
          stroke="#FF6B2B"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
    </svg>
  ),
  hazy: (s) => (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="28" cy="24" r="10" fill="#FF6B2B" opacity="0.8" />
      {[16, 22, 28, 34, 40, 46].map((y, i) => (
        <line key={i} x1="10" y1={y} x2="54" y2={y} stroke="#FF8C42" strokeWidth="2.5" strokeLinecap="round" opacity={0.6 - i * 0.08} />
      ))}
    </svg>
  ),
  dusty: (s) => (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      {[8, 22, 36, 50].map((x, i) => (
        <ellipse key={i} cx={x + 6} cy={32 + (i % 2 === 0 ? -6 : 6)} rx="8" ry="5" fill="#CC4400" opacity={0.4 + i * 0.15} />
      ))}
      <path d="M8 40 Q20 30 32 38 Q44 46 56 36" stroke="#FF6B2B" strokeWidth="2" fill="none" opacity="0.8" />
      <path d="M8 48 Q20 38 32 46 Q44 54 56 44" stroke="#FF4500" strokeWidth="2" fill="none" opacity="0.6" />
    </svg>
  ),
  dust_storm: (s) => (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M32 8 L36 24 L50 20 L38 30 L46 44 L32 36 L18 44 L26 30 L14 20 L28 24 Z" fill="#FF4500" opacity="0.9" />
      {[0, 120, 240].map((a, i) => (
        <path
          key={i}
          d={`M32 32 Q${32 + Math.cos((a * Math.PI) / 180) * 20} ${32 + Math.sin((a * Math.PI) / 180) * 20} ${32 + Math.cos(((a + 30) * Math.PI) / 180) * 28} ${32 + Math.sin(((a + 30) * Math.PI) / 180) * 28}`}
          stroke="#CC3300"
          strokeWidth="2"
          fill="none"
          opacity="0.7"
        />
      ))}
    </svg>
  ),
  frost: (s) => (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="28" cy="20" r="9" fill="#FF6B2B" opacity="0.7" />
      {[0, 60, 120, 180, 240, 300].map((a, i) => (
        <g key={i} transform={`rotate(${a} 36 44)`}>
          <line x1="36" y1="30" x2="36" y2="58" stroke="#a8d8f0" strokeWidth="2" />
          <line x1="29" y1="38" x2="43" y2="38" stroke="#a8d8f0" strokeWidth="2" />
          <line x1="30" y1="33" x2="36" y2="39" stroke="#a8d8f0" strokeWidth="1.5" />
          <line x1="36" y1="39" x2="42" y2="33" stroke="#a8d8f0" strokeWidth="1.5" />
        </g>
      ))}
    </svg>
  ),
  cloudy: (s) => (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <ellipse cx="28" cy="26" rx="14" ry="10" fill="#555" />
      <ellipse cx="38" cy="30" rx="16" ry="10" fill="#666" />
      <ellipse cx="24" cy="34" rx="12" ry="8" fill="#555" />
      <rect x="14" y="30" width="36" height="12" rx="6" fill="#666" />
    </svg>
  ),
  ice_clouds: (s) => (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="26" cy="20" r="10" fill="#FF6B2B" opacity="0.7" />
      <ellipse cx="30" cy="32" rx="18" ry="8" fill="#a8d8f0" opacity="0.5" />
      <ellipse cx="38" cy="38" rx="14" ry="6" fill="#c8e8ff" opacity="0.6" />
    </svg>
  ),
};

export default function WeatherIcon({ condition, size = 64, className = '' }: Props) {
  return (
    <span className={className} aria-label={condition}>
      {icons[condition](size)}
    </span>
  );
}
