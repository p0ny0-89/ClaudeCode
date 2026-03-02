import type { WeatherData } from '../types';
import { getDustRiskColor, getDustRiskLabel } from '../utils/weather';
import WeatherIcon from './WeatherIcon';

interface Props {
  data: WeatherData;
}

export default function DailyForecast({ data }: Props) {
  const maxHigh = Math.max(...data.dailyForecast.map((d) => d.highTemp));
  const minLow = Math.min(...data.dailyForecast.map((d) => d.lowTemp));
  const range = maxHigh - minLow;

  return (
    <div className="card">
      <div className="card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="16" y1="2" x2="16" y2="6" />
        </svg>
        7-Sol Forecast
      </div>
      <div className="daily-list">
        {data.dailyForecast.map((day, i) => {
          const lowPct = ((day.lowTemp - minLow) / range) * 70;
          const highPct = ((day.highTemp - minLow) / range) * 70;
          return (
            <div key={day.sol} className={`daily-row ${i === 0 ? 'today' : ''}`}>
              <div className="daily-sol">
                <span className="daily-day">{i === 0 ? 'Today' : day.earthDate}</span>
                <span className="daily-sol-num">Sol {day.sol}</span>
              </div>
              <WeatherIcon condition={day.condition} size={24} className="daily-icon" />
              <div
                className="dust-dot"
                style={{ background: getDustRiskColor(day.dustStormRisk) }}
                title={`Dust: ${getDustRiskLabel(day.dustStormRisk)}`}
              />
              <div className="daily-bar-wrap">
                <span className="daily-low">{day.lowTemp}°</span>
                <div className="daily-bar-track">
                  <div
                    className="daily-bar-fill"
                    style={{
                      marginLeft: `${lowPct}%`,
                      width: `${highPct - lowPct + 8}%`,
                    }}
                  />
                </div>
                <span className="daily-high">{day.highTemp}°</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
