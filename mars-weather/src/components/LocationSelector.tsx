import { useState } from 'react';
import { MARS_LOCATIONS } from '../data/marsData';
import type { MarsLocation } from '../types';

interface Props {
  selected: MarsLocation;
  onSelect: (loc: MarsLocation) => void;
}

export default function LocationSelector({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="location-selector">
      <button className="location-btn" onClick={() => setOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
        <span>{selected.name}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="location-dropdown">
          {MARS_LOCATIONS.map((loc) => (
            <button
              key={loc.id}
              className={`location-option ${loc.id === selected.id ? 'active' : ''}`}
              onClick={() => { onSelect(loc); setOpen(false); }}
            >
              <div className="loc-name">{loc.name}</div>
              <div className="loc-region">{loc.region}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
