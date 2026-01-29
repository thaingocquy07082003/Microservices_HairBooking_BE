import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { HairstylesModule } from './hairstyles/hairstyles.module';
import { ProfilesModule } from './profile/profile.module';
import {HairCategoriesModule} from "./category/category.module";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    UsersModule,
    HairstylesModule,
    ProfilesModule,
    HairCategoriesModule,
  ],
})
export class AppModule {}