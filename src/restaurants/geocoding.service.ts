import { Injectable, Logger } from '@nestjs/common';

export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly baseUrl = 'https://nominatim.openstreetmap.org';

  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    try {
      const params = new URLSearchParams({
        q: address,
        format: 'json',
        limit: '1',
        countrycodes: 'sn',
      });

      const res = await fetch(`${this.baseUrl}/search?${params}`, {
        headers: {
          'User-Agent': 'OFood-App/1.0',
          'Accept-Language': 'fr',
        },
      });

      if (!res.ok) {
        this.logger.warn(`Nominatim returned ${res.status}`);
        return null;
      }

      const data = await res.json() as Array<{ lat: string; lon: string; display_name: string }>;
      if (!data.length) return null;

      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name,
      };
    } catch (err) {
      this.logger.error('Geocoding failed', err);
      return null;
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        format: 'json',
      });

      const res = await fetch(`${this.baseUrl}/reverse?${params}`, {
        headers: {
          'User-Agent': 'OFood-App/1.0',
          'Accept-Language': 'fr',
        },
      });

      if (!res.ok) return null;

      const data = await res.json() as { display_name?: string };
      return data.display_name || null;
    } catch (err) {
      this.logger.error('Reverse geocoding failed', err);
      return null;
    }
  }
}
