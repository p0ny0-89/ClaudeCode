import type { WeatherData } from '../types';
import { getDustRiskColor, getDustRiskLabel, getPressureBar, getWindDir } from '../utils/weather';

interface Props {
  data: WeatherData;
}

function DetailCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="detail-card">
      <div className="detail-title">{icon} {title}</div>
      {children}
    </div>
  );
}

export default function WeatherDetails({ data }: Props) {
  const windAngle = getWindDir(data.windDirection);
  const dustColor = getDustRiskColor(data.dustStormRisk);

  return (
    <div className="details-grid">
      {/* Wind */}
      <DetailCard title="Wind" icon="💨">
        <div className="wind-compass">
          <div className="compass-ring">
            <span className="compass-n">N</span>
            <span className="compass-s">S</span>
            <span className="compass-e">E</span>
            <span className="compass-w">W</span>
            <div
              className="compass-arrow"
              style={{ transform: `rotate(${windAngle}deg)` }}
            />
          </div>
        </div>
        <div className="detail-main">{data.windSpeed} <span className="detail-unit">km/h</span></div>
        <div className="detail-sub">Gusts: {data.windGusts} km/h · {data.windDirection}</div>
      </DetailCard>

      {/* Pressure */}
      <DetailCard title="Pressure" icon="📊">
        <div className="detail-main">{data.pressure} <span className="detail-unit">Pa</span></div>
        <div className="pressure-bar-wrap">
          <div className="pressure-bar-track">
            <div className="pressure-bar-fill" style={{ width: `${getPressureBar(data.pressure)}%` }} />
          </div>
        </div>
        <div className="detail-sub">{(data.pressure / 101325 * 100).toFixed(3)}% of Earth</div>
      </DetailCard>

      {/* Dust Storm */}
      <DetailCard title="Dust Risk" icon="🌪">
        <div className="dust-gauge-wrap">
          <svg width="80" height="48" viewBox="0 0 80 48">
            <path d="M8 44 A36 36 0 0 1 72 44" stroke="#333" strokeWidth="8" fill="none" strokeLinecap="round" />
            <path
              d="M8 44 A36 36 0 0 1 72 44"
              stroke={dustColor}
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${({ low: 45, moderate: 80, high: 105, extreme: 113 }[data.dustStormRisk])} 113`}
              opacity="0.9"
            />
          </svg>
        </div>
        <div className="detail-main" style={{ color: dustColor }}>
          {getDustRiskLabel(data.dustStormRisk)}
        </div>
        <div className="detail-sub">τ {data.dustOpacity.toFixed(2)}</div>
      </DetailCard>

      {/* UV Index */}
      <DetailCard title="UV Index" icon="☀">
        <div className="uv-bar-wrap">
          <div className="uv-segments">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="uv-seg"
                style={{
                  background: i < data.uvIndex
                    ? `hsl(${40 - i * 3}, 100%, ${60 - i * 2}%)`
                    : '#222',
                }}
              />
            ))}
          </div>
        </div>
        <div className="detail-main">{data.uvIndex.toFixed(1)} <span className="detail-unit">UV</span></div>
        <div className="detail-sub">{data.uvIndex > 10 ? 'Extreme' : data.uvIndex > 7 ? 'Very High' : 'High'}</div>
      </DetailCard>

      {/* Visibility */}
      <DetailCard title="Visibility" icon="👁">
        <div className="detail-main">{data.visibility} <span className="detail-unit">km</span></div>
        <div className="vis-bar-track">
          <div className="vis-bar-fill" style={{ width: `${(data.visibility / 50) * 100}%` }} />
        </div>
        <div className="detail-sub">{data.visibility < 10 ? 'Poor' : data.visibility < 25 ? 'Fair' : 'Good'}</div>
      </DetailCard>

      {/* Sun Times */}
      <DetailCard title="Daylight" icon="🌅">
        <div className="sun-times">
          <div className="sun-item">
            <div className="sun-label">Sunrise</div>
            <div className="sun-time">{data.sunrise}</div>
          </div>
          <div className="sun-arc">
            <svg width="60" height="30" viewBox="0 0 60 30">
              <path d="M5 28 Q30 2 55 28" stroke="#FF6B2B" strokeWidth="1.5" fill="none" opacity="0.5" />
              <circle cx="30" cy="8" r="4" fill="#FF6B2B" opacity="0.8" />
            </svg>
          </div>
          <div className="sun-item">
            <div className="sun-label">Sunset</div>
            <div className="sun-time">{data.sunset}</div>
          </div>
        </div>
        <div className="detail-sub">Sol: ~24h 37m</div>
      </DetailCard>
    </div>
  );
}
