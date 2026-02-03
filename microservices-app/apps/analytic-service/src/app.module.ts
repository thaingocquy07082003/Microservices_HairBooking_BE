import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// import { ReportsModule } from './reports/reports.module';
// import { DashboardsModule } from './dashboards/dashboards.module';
// import { StatisticsModule } from './statistics/statistics.module';
// import { InsightsModule } from './insights/insights.module';
// import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // AnalyticsModule, 
    // ReportsModule,
    // DashboardsModule,
    // StatisticsModule,
    // InsightsModule,
  ],
})
export class AppModule {}