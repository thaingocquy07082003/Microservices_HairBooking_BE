/* eslint-disable @typescript-eslint/require-await */
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger: Logger;

  constructor(private configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });

    this.logger = new Logger(JwtStrategy.name);
    // Log để debug
    this.logger.log(`JWT_SECRET loaded: ${secret?.substring(0, 10)}...`);
  }

  async validate(payload: JwtPayload) {
    this.logger.log(`Validating JWT payload: ${JSON.stringify(payload)}`);
    
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}