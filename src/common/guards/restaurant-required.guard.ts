import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../decorators/current-user.decorator';
import { SKIP_RESTAURANT_CHECK_KEY } from '../decorators/skip-restaurant-check.decorator';

@Injectable()
export class RestaurantRequiredGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESTAURANT_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();

    if (!user || user.role !== Role.RESTAURANT_OWNER) {
      return true;
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { ownerId: user.sub },
      select: { id: true },
    });

    if (!restaurant) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'RESTAURANT_SETUP_REQUIRED',
        message: 'Vous devez d\'abord créer votre restaurant avant de continuer.',
      });
    }

    return true;
  }
}
