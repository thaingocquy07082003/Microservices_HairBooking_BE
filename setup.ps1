# PowerShell Setup Script for Microservices
# Run with: .\setup.ps1

Write-Host "========================================" -ForegroundColor Green
Write-Host "   Microservices Setup Script" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js chưa được cài đặt!" -ForegroundColor Red
    Write-Host "Vui lòng tải và cài đặt từ: https://nodejs.org/" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "[OK] Node.js version: $(node --version)" -ForegroundColor Green

# Check if NestJS CLI is installed
if (-not (Get-Command nest -ErrorAction SilentlyContinue)) {
    Write-Host "[INFO] Đang cài đặt NestJS CLI..." -ForegroundColor Yellow
    npm install -g @nestjs/cli
}

Write-Host "[OK] NestJS CLI version: $(nest --version)" -ForegroundColor Green

# Step 1: Create project
Write-Host ""
Write-Host "[Step 1] Tạo NestJS project..." -ForegroundColor Cyan
nest new microservices-app --package-manager npm --skip-git
Set-Location microservices-app

# Step 2: Convert to monorepo
Write-Host ""
Write-Host "[Step 2] Chuyển thành monorepo..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "apps/api-gateway" | Out-Null
Copy-Item -Recurse -Force "src" "apps/api-gateway/"
Copy-Item -Recurse -Force "test" "apps/api-gateway/"
Remove-Item -Recurse -Force "src"
Remove-Item -Recurse -Force "test"

# Generate services
Write-Host ""
Write-Host "[Step 3] Tạo microservices..." -ForegroundColor Cyan
nest generate app auth-service --skip-git
nest generate app user-service --skip-git

# Generate libraries
Write-Host ""
Write-Host "[Step 4] Tạo shared libraries..." -ForegroundColor Cyan
nest generate library common --skip-git
nest generate library kafka --skip-git
nest generate library redis --skip-git

# Step 5: Install dependencies
Write-Host ""
Write-Host "[Step 5] Cài đặt dependencies (có thể mất vài phút)..." -ForegroundColor Cyan
npm install --save @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/microservices @nestjs-modules/mailer @supabase/supabase-js passport passport-jwt bcrypt class-validator class-transformer kafkajs ioredis nodemailer handlebars

npm install --save-dev @types/bcrypt @types/passport-jwt @types/nodemailer

# Step 6: Create directory structure
Write-Host ""
Write-Host "[Step 6] Tạo cấu trúc thư mục..." -ForegroundColor Cyan

# Common library
$commonDirs = @(
    "libs/common/src/constants",
    "libs/common/src/decorators",
    "libs/common/src/dto",
    "libs/common/src/enums",
    "libs/common/src/filters",
    "libs/common/src/guards",
    "libs/common/src/strategies",
    "libs/common/src/validators",
    "libs/common/src/services"
)

foreach ($dir in $commonDirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

# Auth service
$authDirs = @(
    "apps/auth-service/src/auth/dto",
    "apps/auth-service/src/mail/templates",
    "apps/auth-service/src/supabase"
)

foreach ($dir in $authDirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

# User service
New-Item -ItemType Directory -Force -Path "apps/user-service/src/users/dto" | Out-Null

# Step 7: Create config files
Write-Host ""
Write-Host "[Step 7] Tạo file cấu hình..." -ForegroundColor Cyan

# Create .env.example
$envContent = @"
# Application
NODE_ENV=development
APP_URL=http://localhost:3000
PORT=3000

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRATION=24h

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=yourRedisPassword

# Kafka Configuration
KAFKA_BROKERS=localhost:9092

# Mail Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM_NAME=Your App Name
MAIL_FROM_ADDRESS=noreply@yourapp.com
SUPPORT_EMAIL=support@yourapp.com

# CORS
CORS_ORIGIN=http://localhost:3000

# Password Hashing
SALT_ROUNDS=10
"@

Set-Content -Path ".env.example" -Value $envContent
Copy-Item ".env.example" ".env"

# Create docker-compose.yml
$dockerComposeContent = @"
version: '3.8'

services:
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    ports:
      - "2181:2181"

  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true'

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --requirepass yourRedisPassword
    volumes:
      - redis_data:/data

volumes:
  redis_data:
"@

Set-Content -Path "docker-compose.yml" -Value $dockerComposeContent

# Create .gitignore
$gitignoreContent = @"
# compiled output
/dist
/node_modules

# Logs
logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# Tests
/coverage
/.nyc_output

# IDEs
/.idea
.vscode/*
!.vscode/settings.json

# Environment variables
.env
.env.local
.env.*.local
"@

Set-Content -Path ".gitignore" -Value $gitignoreContent

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ Setup hoàn tất!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Bước tiếp theo:" -ForegroundColor Yellow
Write-Host "1. Chỉnh sửa file .env với thông tin của bạn"
Write-Host "2. Copy source code vào các file tương ứng"
Write-Host "3. Khởi động Docker: docker-compose up -d"
Write-Host "4. Khởi động Auth Service: npm run start:dev auth-service"
Write-Host "5. Khởi động User Service: npm run start:dev user-service"
Write-Host "6. Khởi động API Gateway: npm run start:dev api-gateway"
Write-Host ""
Write-Host "Happy coding! 🚀" -ForegroundColor Green
Write-Host ""
Write-Host "Nhan vao phim bat ky de thoat..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")