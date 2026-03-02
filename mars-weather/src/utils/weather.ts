import type { WeatherCondition, DustRisk } from '../types';

export function getConditionLabel(condition: WeatherCondition): string {
  const labels: Record<WeatherCondition, string> = {
    clear: 'Clear Skies',
    hazy: 'Hazy',
    dusty: 'Dusty',
    dust_storm: 'Dust Storm',
    frost: 'Surface Frost',
    cloudy: 'Cloudy',
    ice_clouds: 'Ice Clouds',
  };
  return labels[condition];
}

export function getConditionIcon(condition: WeatherCondition): string {
  const icons: Record<WeatherCondition, string> = {
    clear: '☀',
    hazy: '🌫',
    dusty: '💨',
    dust_storm: '🌪',
    frost: '❄',
    cloudy: '☁',
    ice_clouds: '🌤',
  };
  return icons[condition];
}

export function getDustRiskLabel(risk: DustRisk): string {
  const labels: Record<DustRisk, string> = {
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    extreme: 'Extreme',
  };
  return labels[risk];
}

export function getDustRiskColor(risk: DustRisk): string {
  const colors: Record<DustRisk, string> = {
    low: '#4ade80',
    moderate: '#facc15',
    high: '#fb923c',
    extreme: '#ef4444',
  };
  return colors[risk];
}

export function getWindDir(dir: string): number {
  const dirs: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  return dirs[dir] ?? 0;
}

export function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function getPressureBar(pressure: number): number {
  // Earth sea level ~ 101325 Pa; Mars range ~600–1200 Pa
  // Scale 0–100 relative to Mars max (1200)
  return Math.min(100, (pressure / 1200) * 100);
}
