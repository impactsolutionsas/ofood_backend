import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { GeocodingService } from './geocoding.service';

@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsService, GeocodingService],
  exports: [RestaurantsService, GeocodingService],
})
export class RestaurantsModule {}
