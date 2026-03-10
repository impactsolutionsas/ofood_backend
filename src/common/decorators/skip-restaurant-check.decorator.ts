import { SetMetadata } from '@nestjs/common';

export const SKIP_RESTAURANT_CHECK_KEY = 'skipRestaurantCheck';
export const SkipRestaurantCheck = () =>
  SetMetadata(SKIP_RESTAURANT_CHECK_KEY, true);
