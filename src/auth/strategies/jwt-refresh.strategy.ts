import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'JWT_REFRESH_SECRET',
        'refresh_secret',
      ),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: { sub: string; role?: string; type?: string; jti?: string },
  ): Promise<JwtPayload> {
    if (payload.type && payload.type !== 'refresh') {
      throw new UnauthorizedException('Refresh token invalide');
    }

    if (payload.jti) {
      const blacklisted = await this.redisService.exists(
        `refresh_token:blacklist:${payload.jti}`,
      );
      if (blacklisted) {
        throw new UnauthorizedException('Refresh token révoqué');
      }
    }

    return {
      sub: payload.sub,
      role: (payload.role ?? 'CLIENT') as JwtPayload['role'],
      type: 'refresh',
      jti: payload.jti,
    };
  }
}
