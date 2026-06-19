import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Guards machine-to-machine ingest endpoints (the ML pipeline) with a shared
 * secret in the `x-api-key` header, independent of the user JWT flow.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const provided = req.headers['x-api-key'];
    const expected = this.config.get<string>('INGEST_API_KEY');
    if (!expected || provided !== expected) {
      throw new UnauthorizedException('API key tidak valid.');
    }
    return true;
  }
}
