import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @Post('initiate')
  @ApiOperation({ summary: 'Initier un paiement pour une commande (CLIENT)' })
  @ApiResponse({ status: 201, description: 'Paiement initié' })
  @ApiResponse({ status: 400, description: 'Commande non payable' })
  @ApiResponse({ status: 404, description: 'Commande non trouvée' })
  async initiatePayment(
    @CurrentUser('sub') userId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(userId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @Post(':id/verify')
  @ApiOperation({ summary: 'Vérifier un paiement (CLIENT)' })
  @ApiResponse({ status: 200, description: 'Statut du paiement' })
  @ApiResponse({ status: 404, description: 'Transaction non trouvée' })
  async verifyPayment(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.paymentsService.verifyPayment(userId, id, dto);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Transactions d\'une commande (client ou owner)' })
  @ApiResponse({ status: 200, description: 'Transactions retournées' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  async getOrderTransactions(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
    @Param('orderId', ParseUuidPipe) orderId: string,
  ) {
    return this.paymentsService.getOrderTransactions(userId, role, orderId);
  }
}
