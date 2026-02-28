import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Inscription — envoie un OTP par SMS' })
  @ApiResponse({ status: 201, description: 'OTP envoyé par SMS' })
  @ApiResponse({ status: 409, description: 'Ce numéro est déjà utilisé' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('verify-otp')
  @ApiOperation({ summary: 'Vérification OTP — active le compte et retourne les tokens' })
  @ApiResponse({ status: 201, description: 'Compte activé, tokens retournés' })
  @ApiResponse({ status: 400, description: 'OTP invalide ou expiré' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Connexion par téléphone + PIN' })
  @ApiResponse({ status: 201, description: 'Tokens retournés' })
  @ApiResponse({ status: 401, description: 'Identifiants incorrects' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @ApiOperation({ summary: 'Rafraîchir le access token' })
  @ApiResponse({ status: 201, description: 'Nouveaux tokens retournés' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.authService.refresh(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: 'Déconnexion — invalide le refresh token' })
  @ApiResponse({ status: 201, description: 'Déconnexion réussie' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Body() dto: LogoutDto,
  ) {
    return this.authService.logout(user, dto.refreshToken);
  }
}
