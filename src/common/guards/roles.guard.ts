import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

// COURIER inherits CLIENT permissions (can access CLIENT routes)
const ROLE_INCLUDES: Record<string, Role[]> = {
  [Role.COURIER]: [Role.COURIER, Role.CLIENT],
  [Role.ADMIN]: [Role.ADMIN],
  [Role.CLIENT]: [Role.CLIENT],
  [Role.RESTAURANT_OWNER]: [Role.RESTAURANT_OWNER],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    const userRoles = ROLE_INCLUDES[user.role] || [user.role];
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException('Accès refusé');
    }

    return true;
  }
}
