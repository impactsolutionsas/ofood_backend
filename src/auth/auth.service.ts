import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type ms from 'ms';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtPayload } from '../common/decorators/current-user.decorator';

const SALT_ROUNDS = 12;
const OTP_TTL_SECONDS = 5 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const normalizedPhone = this.normalizePhone(dto.phone);

    const existing = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existing) {
      throw new ConflictException('Ce numéro de téléphone est déjà inscrit');
    }

    const pinHash = await bcrypt.hash(dto.pin, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: normalizedPhone,
        email: dto.email ?? null,
        pinHash,
        role: dto.role,
        isActive: false,
      },
    });

    // Auto-create wallet for the user
    await this.prisma.wallet.create({
      data: { userId: user.id, balance: 0, frozenAmount: 0 },
    });

    const otp = this.generateOtp();

    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        code: otp,
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      },
    });

    const message = `Bienvenue sur O'Food ! Votre code de vérification : ${otp}`;
    await this.smsService.sendSms(normalizedPhone, message);

    return { message: 'OTP envoyé par SMS' };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: UserResponseDto;
  }> {
    const normalizedPhone = this.normalizePhone(dto.phone);

    const user = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
      include: {
        otpCodes: true,
        restaurant: {
          select: { id: true, name: true, isVerified: true, isOpen: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Code OTP invalide');
    }

    const validOtp = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        code: dto.code,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!validOtp) {
      throw new UnauthorizedException('Code OTP invalide ou expiré');
    }

    await this.prisma.$transaction([
      this.prisma.otpCode.update({
        where: { id: validOtp.id },
        data: { used: true },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { isActive: true },
      }),
    ]);

    const tokens = await this.generateTokens(user.id, user.role);
    const userResponse = this.toUserResponse(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userResponse,
    };
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: UserResponseDto;
  }> {
    const normalizedPhone = this.normalizePhone(dto.phone);

    const user = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
      include: {
        restaurant: {
          select: { id: true, name: true, isVerified: true, isOpen: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Téléphone ou PIN incorrect');
    }

    const validPin = await bcrypt.compare(dto.pin, user.pinHash);

    if (!validPin) {
      throw new UnauthorizedException('Téléphone ou PIN incorrect');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Compte non activé. Veuillez vérifier votre code OTP.',
      );
    }

    const tokens = await this.generateTokens(user.id, user.role);
    const userResponse = this.toUserResponse(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userResponse,
    };
  }

  async refresh(payload: JwtPayload): Promise<{
    accessToken: string;
    refreshToken: string;
    user: UserResponseDto;
  }> {
    const { sub, jti } = payload;

    if (jti) {
      const blacklisted = await this.redisService.exists(
        `refresh_token:blacklist:${jti}`,
      );
      if (blacklisted) {
        throw new UnauthorizedException('Refresh token invalide');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      include: {
        restaurant: {
          select: { id: true, name: true, isVerified: true, isOpen: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Utilisateur introuvable ou inactif');
    }

    const tokens = await this.generateTokens(user.id, user.role);
    const userResponse = this.toUserResponse(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userResponse,
    };
  }

  async logout(payload: JwtPayload, refreshToken?: string): Promise<{ message: string }> {
    if (refreshToken) {
      try {
        const decoded = this.jwtService.verify<{ sub: string; jti?: string }>(
          refreshToken,
          {
            secret: this.configService.get<string>(
              'JWT_REFRESH_SECRET',
              'refresh_secret',
            ),
          },
        );
        if (decoded.sub === payload.sub && decoded.jti) {
          await this.redisService.set(
            `refresh_token:blacklist:${decoded.jti}`,
            '1',
            REFRESH_TOKEN_TTL_SECONDS,
          );
        }
      } catch {
        // Invalid refresh token - ignore, user is logging out anyway
      }
    }

    return { message: 'Déconnexion réussie' };
  }

  private async generateTokens(
    userId: string,
    role: Role,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const crypto = await import('crypto');
    const jti = crypto.randomUUID();

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        role,
        type: 'access',
      },
      {
        secret: this.configService.get('JWT_SECRET', 'secret'),
        expiresIn: (this.configService.get('JWT_EXPIRES_IN', '15m') ?? '15m') as ms.StringValue,
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: userId,
        type: 'refresh',
        jti,
      },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET', 'refresh_secret'),
        expiresIn: (this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') ?? '7d') as ms.StringValue,
      },
    );

    return { accessToken, refreshToken };
  }

  private generateOtp(): string {
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    return otp;
  }

  private normalizePhone(phone: string): string {
    let normalized = phone.replace(/\D/g, '');
    if (normalized.startsWith('0')) {
      normalized = '221' + normalized.slice(1);
    } else if (!normalized.startsWith('221') && normalized.length === 9) {
      normalized = '221' + normalized;
    }
    return normalized;
  }

  private toUserResponse(
    user: User & { restaurant?: { id: string; name: string; isVerified: boolean; isOpen: boolean } | null },
  ): UserResponseDto {
    return new UserResponseDto({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      restaurant: user.restaurant ?? null,
    });
  }
}
