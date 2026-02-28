import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const errorBody =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as { error?: string; message?: string | string[] })
        : { error: undefined, message: undefined };

    const errorCode =
      typeof errorBody.error === 'string' ? errorBody.error : undefined;
    const message =
      typeof errorBody.message === 'string'
        ? errorBody.message
        : Array.isArray(errorBody.message)
          ? errorBody.message[0]
          : exception.message;

    const body = {
      success: false,
      error: errorCode ?? `HTTP_${status}`,
      message: message ?? 'Une erreur est survenue',
      statusCode: status,
    };

    this.logger.warn(
      `${request.method} ${request.url} - ${status} - ${message}`,
    );

    response.status(status).json(body);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error ? exception.message : 'Erreur serveur';

    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
    );

    response.status(status).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: status === 500 ? 'Erreur interne du serveur' : message,
      statusCode: status,
    });
  }
}
