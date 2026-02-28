import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { WalletService } from './wallet.service';
import { RechargeWalletDto } from './dto/recharge-wallet.dto';
import { WalletPaymentDto } from './dto/wallet-payment.dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
@UseGuards(RolesGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  @Roles(Role.CLIENT)
  getMyWallet(@CurrentUser() user: JwtPayload) {
    return this.walletService.getMyWallet(user.sub);
  }

  @Post('recharge')
  @Roles(Role.CLIENT)
  recharge(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RechargeWalletDto,
  ) {
    return this.walletService.recharge(user.sub, dto);
  }

  @Get('transactions')
  @Roles(Role.CLIENT)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTransactions(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.walletService.getTransactions(user.sub, page, limit);
  }

  @Post('pay')
  @Roles(Role.CLIENT)
  payWithWallet(
    @CurrentUser() user: JwtPayload,
    @Body() dto: WalletPaymentDto,
  ) {
    return this.walletService.payWithWallet(user.sub, dto);
  }
}
