// apps/user-service/src/hairstyles/seed-hairstyles.ts
// Script để tạo dữ liệu mẫu cho testing

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { HairstylesService } from './hairstyles.service';
import { HairstyleCategory } from '@app/common';

async function seedData() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const hairstylesService = app.get(HairstylesService);

  try {
    console.log('🌱 Bắt đầu tạo dữ liệu mẫu...');

    // Tạo Stylists
    const stylist1 = await hairstylesService.createStylist({
      userId: 'user_1',
      fullName: 'Nguyễn Văn An',
      avatarUrl: 'https://example.com/avatar1.jpg',
      experience: 5,
      specialties: ['Cắt tóc nam', 'Uốn tóc', 'Nhuộm tóc'],
    });

    const stylist2 = await hairstylesService.createStylist({
      userId: 'user_2',
      fullName: 'Trần Thị Bình',
      avatarUrl: 'https://example.com/avatar2.jpg',
      experience: 8,
      specialties: ['Cắt tóc nữ', 'Tạo kiểu', 'Duỗi tóc'],
    });

    const stylist3 = await hairstylesService.createStylist({
      userId: 'user_3',
      fullName: 'Lê Minh Cường',
      avatarUrl: 'https://example.com/avatar3.jpg',
      experience: 3,
      specialties: ['Cắt tóc nam', 'Cắt râu', 'Tỉa râu'],
    });

    console.log('✅ Đã tạo 3 thợ cắt tóc');

    // Tạo Hairstyles
    const hairstyles = [
      {
        name: 'Undercut Classic',
        description: 'Kiểu tóc Undercut cổ điển, phù hợp với phong cách lịch lãm',
        price: 150000,
        duration: 45,
        imageUrl: 'https://example.com/undercut.jpg',
        category: HairstyleCategory.MEN_SHORT,
        difficulty: 'medium' as const,
        stylistIds: [stylist1.id, stylist3.id],
      },
      {
        name: 'Mohawk Fade',
        description: 'Kiểu tóc Mohawk với fade hiện đại, cá tính mạnh mẽ',
        price: 200000,
        duration: 60,
        imageUrl: 'https://example.com/mohawk.jpg',
        category: HairstyleCategory.MEN_SHORT,
        difficulty: 'hard' as const,
        stylistIds: [stylist1.id],
      },
      {
        name: 'Bob Ngắn',
        description: 'Kiểu tóc bob ngắn trẻ trung, năng động',
        price: 250000,
        duration: 60,
        imageUrl: 'https://example.com/bob.jpg',
        category: HairstyleCategory.WOMEN_SHORT,
        difficulty: 'medium' as const,
        stylistIds: [stylist2.id],
      },
      {
        name: 'Layer Dài',
        description: 'Kiểu tóc layer dài tự nhiên, phù hợp mọi khuôn mặt',
        price: 300000,
        duration: 75,
        imageUrl: 'https://example.com/layer.jpg',
        category: HairstyleCategory.WOMEN_LONG,
        difficulty: 'easy' as const,
        stylistIds: [stylist2.id],
      },
      {
        name: 'Crew Cut',
        description: 'Kiểu tóc quân đội đơn giản, gọn gàng',
        price: 100000,
        duration: 30,
        imageUrl: 'https://example.com/crew.jpg',
        category: HairstyleCategory.MEN_SHORT,
        difficulty: 'easy' as const,
        stylistIds: [stylist1.id, stylist3.id],
      },
      {
        name: 'Uốn Xoăn Bồng Bềnh',
        description: 'Uốn tóc xoăn nhẹ, tạo độ phồng tự nhiên',
        price: 500000,
        duration: 120,
        imageUrl: 'https://example.com/curly.jpg',
        category: HairstyleCategory.WOMEN_LONG,
        difficulty: 'hard' as const,
        stylistIds: [stylist2.id],
      },
      {
        name: 'Cắt Tóc Trẻ Em',
        description: 'Cắt tóc cho bé, nhiều kiểu dáng đáng yêu',
        price: 80000,
        duration: 30,
        imageUrl: 'https://example.com/kids.jpg',
        category: HairstyleCategory.KIDS,
        difficulty: 'easy' as const,
        stylistIds: [stylist1.id, stylist2.id, stylist3.id],
      },
      {
        name: 'Tạo Kiểu Râu Hiện Đại',
        description: 'Tạo hình râu theo phong cách hiện đại, chỉnh sửa cẩn thận',
        price: 120000,
        duration: 40,
        imageUrl: 'https://example.com/beard.jpg',
        category: HairstyleCategory.BEARD,
        difficulty: 'medium' as const,
        stylistIds: [stylist3.id],
      },
      {
        name: 'Nhuộm Highlight',
        description: 'Nhuộm highlights tạo điểm nhấn cho mái tóc',
        price: 400000,
        duration: 90,
        imageUrl: 'https://example.com/highlight.jpg',
        category: HairstyleCategory.COLORING,
        difficulty: 'medium' as const,
        stylistIds: [stylist1.id, stylist2.id],
      },
      {
        name: 'Duỗi Phồng Tự Nhiên',
        description: 'Duỗi tóc tự nhiên, giữ độ phồng mềm mại',
        price: 600000,
        duration: 150,
        imageUrl: 'https://example.com/straight.jpg',
        category: HairstyleCategory.PERM,
        difficulty: 'hard' as const,
        stylistIds: [stylist2.id],
      },
    ];

    for (const hairstyle of hairstyles) {
      await hairstylesService.createHairstyle(hairstyle);
    }

    console.log(`✅ Đã tạo ${hairstyles.length} kiểu tóc`);
    console.log('🎉 Hoàn thành tạo dữ liệu mẫu!');
  } catch (error) {
    console.error('❌ Lỗi khi tạo dữ liệu:', error);
  } finally {
    await app.close();
  }
}

seedData();