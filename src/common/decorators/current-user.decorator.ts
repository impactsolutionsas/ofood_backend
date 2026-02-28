import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string;
  role: string;
  type: 'access' | 'refresh';
  jti?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | string => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = request.user as JwtPayload;

    if (data && user) {
      const value = user[data];
      return value as JwtPayload | string;
    }

    return user;
  },
);
