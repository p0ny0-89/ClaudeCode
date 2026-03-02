export interface MarsLocation {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  elevation: number; // meters above MOLA datum
}

export interface HourlyForecast {
  hour: number;
  temp: number;
  condition: WeatherCondition;
  windSpeed: number;
}

export interface DailyForecast {
  sol: number;
  earthDate: string;
  highTemp: number;
  lowTemp: number;
  condition: WeatherCondition;
  dustStormRisk: DustRisk;
}

export type WeatherCondition =
  | 'clear'
  | 'hazy'
  | 'dusty'
  | 'dust_storm'
  | 'frost'
  | 'cloudy'
  | 'ice_clouds';

export type DustRisk = 'low' | 'moderate' | 'high' | 'extreme';

export interface WeatherData {
  location: MarsLocation;
  sol: number;
  earthDate: string;
  currentTemp: number;
  feelsLike: number;
  highTemp: number;
  lowTemp: number;
  condition: WeatherCondition;
  pressure: number; // Pa
  windSpeed: number; // km/h
  windDirection: string;
  windGusts: number;
  humidity: number; // %
  uvIndex: number;
  dustStormRisk: DustRisk;
  dustOpacity: number; // tau (optical depth)
  visibility: number; // km
  sunrise: string;
  sunset: string;
  hourlyForecast: HourlyForecast[];
  dailyForecast: DailyForecast[];
}
