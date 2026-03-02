import type { WeatherData } from '../types';
import { formatHour } from '../utils/weather';
import WeatherIcon from './WeatherIcon';

interface Props {
  data: WeatherData;
}

export default function HourlyForecast({ data }: Props) {
  return (
    <div className="card">
      <div className="card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        Hourly Forecast
      </div>
      <div className="hourly-scroll">
        {data.hourlyForecast.map((h) => (
          <div key={h.hour} className="hourly-item">
            <div className="hourly-time">{formatHour(h.hour)}</div>
            <WeatherIcon condition={h.condition} size={32} />
            <div className="hourly-temp">{h.temp}°</div>
            <div className="hourly-wind">{h.windSpeed}<span>km/h</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
