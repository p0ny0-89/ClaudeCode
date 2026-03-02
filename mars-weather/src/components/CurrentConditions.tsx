import type { WeatherData } from '../types';
import { getConditionLabel } from '../utils/weather';
import WeatherIcon from './WeatherIcon';

interface Props {
  data: WeatherData;
}

export default function CurrentConditions({ data }: Props) {
  return (
    <div className="current-conditions">
      <div className="sol-badge">Sol {data.sol}</div>
      <div className="current-icon-wrap">
        <WeatherIcon condition={data.condition} size={120} />
        <div className="icon-glow" />
      </div>
      <div className="current-temp">{data.currentTemp}°</div>
      <div className="current-condition-label">{getConditionLabel(data.condition)}</div>
      <div className="feels-like">Feels like {data.feelsLike}°C</div>
      <div className="temp-range">
        <span className="temp-high">H: {data.highTemp}°</span>
        <span className="temp-divider">|</span>
        <span className="temp-low">L: {data.lowTemp}°</span>
      </div>
    </div>
  );
}
