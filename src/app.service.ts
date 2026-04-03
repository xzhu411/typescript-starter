import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'check out localhost:3000/api#/ to see the swagger UI';
  }
}
