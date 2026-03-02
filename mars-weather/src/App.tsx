import { useState } from 'react';
import { MARS_LOCATIONS, WEATHER_DATA } from './data/marsData';
import type { MarsLocation } from './types';
import LocationSelector from './components/LocationSelector';
import CurrentConditions from './components/CurrentConditions';
import HourlyForecast from './components/HourlyForecast';
import DailyForecast from './components/DailyForecast';
import WeatherDetails from './components/WeatherDetails';
import './App.css';

type Tab = 'today' | 'forecast' | 'details';

export default function App() {
  const [location, setLocation] = useState<MarsLocation>(MARS_LOCATIONS[0]);
  const [tab, setTab] = useState<Tab>('today');

  const data = WEATHER_DATA[location.id];

  return (
    <div className="app-shell">
      <div className="phone-frame">
        {/* Status bar */}
        <div className="status-bar">
          <span>MARS WEATHER</span>
          <span className="status-dot" />
          <span>{data.earthDate}</span>
        </div>

        {/* Header */}
        <header className="app-header">
          <LocationSelector selected={location} onSelect={setLocation} />
          <div className="elevation-badge">
            {data.location.elevation >= 0 ? '+' : ''}
            {data.location.elevation.toLocaleString()}m
          </div>
        </header>

        {/* Main scroll area */}
        <main className="app-main">
          <CurrentConditions data={data} />

          {/* Tab nav */}
          <nav className="tab-nav">
            {(['today', 'forecast', 'details'] as Tab[]).map((t) => (
              <button
                key={t}
                className={`tab-btn ${tab === t ? 'active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>

          {/* Tab content */}
          <div className="tab-content">
            {tab === 'today' && <HourlyForecast data={data} />}
            {tab === 'forecast' && <DailyForecast data={data} />}
            {tab === 'details' && <WeatherDetails data={data} />}
          </div>
        </main>

        {/* Bottom nav */}
        <nav className="bottom-nav">
          <button className="bottom-btn active">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3L2 12h3v9h6v-6h2v6h6v-9h3z" />
            </svg>
            <span>Home</span>
          </button>
          <button className="bottom-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span>Explore</span>
          </button>
          <button className="bottom-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 20V10M12 20V4M6 20v-6" />
            </svg>
            <span>Charts</span>
          </button>
          <button className="bottom-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            <span>Profile</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
