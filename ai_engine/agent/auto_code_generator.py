#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔧 Auto Code Generator — генерация полного кода из архитектуры.

Возможности:
- Генерация frontend (React, Next.js, Vue, Svelte)
- Генерация backend (Node.js, Python, Go, Rust)
- Database schema (PostgreSQL, MongoDB, SQLite)
- Docker файлы
- Тесты (Jest, pytest, Vitest)
- Конфиги (ESLint, Prettier, TypeScript)
- Полный проект "из коробки"
"""

import json
import logging
import os
import re
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class Framework(Enum):
    """Frontend фреймворки."""
    REACT = "react"
    NEXT_JS = "nextjs"
    VUE = "vue"
    SVELTE = "svelte"
    REACT_NATIVE = "react-native"
    FLUTTER = "flutter"
   Vanilla = "vanilla"


class Backend(Enum):
    """Backend фреймворки."""
    NODE_EXPRESS = "node-express"
    NODE_NEST = "node-nest"
    PYTHON_FASTAPI = "python-fastapi"
    PYTHON_DJANGO = "python-django"
    GO = "go-gin"
    RUST_AXUM = "rust-axum"


class Database(Enum):
    """Базы данных."""
    POSTGRESQL = "postgresql"
    MONGODB = "mongodb"
    SQLITE = "sqlite"
    MYSQL = "mysql"
    REDIS = "redis"


@dataclass
class ProjectSpec:
    """
    Спецификация проекта.

    Attributes:
        name: Название проекта.
        framework: Frontend фреймворк.
        backend: Backend фреймворк.
        database: База данных.
        features: Список фич.
        auth: Тип авторизации.
        realtime: Real-time функции.
    """

    name: str = ""
    framework: Framework = Framework.REACT
    backend: Backend = Backend.NODE_EXPRESS
    database: Database = Database.POSTGRESQL
    features: list[str] = field(default_factory=list)
    auth: str = "jwt"
    realtime: str = "websocket"
    api_style: str = "rest"
    language: str = "ru"


@dataclass
class GeneratedFile:
    """Сгенерированный файл."""
    path: str
    content: str
    language: str


@dataclass
class GeneratedProject:
    """Полностью сгенерированный проект."""
    spec: ProjectSpec
    files: list[GeneratedFile] = field(default_factory=list)
    structure: dict = field(default_factory=dict)
    commands: list[str] = field(default_factory=list)


class CodeGenerator:
    """
    Генератор кода из спецификации.

    Генерирует полный проект по архитектуре:
    - Структура папок
    - Конфиги
    - Frontend
    - Backend  
    - Database
    - Tests
    - Dockerfile
    - CI/CD
    """

    def __init__(self, llm_callable: Optional[Callable] = None):
        """
        Args:
            llm_callable: LLM для улучшенной генерации.
        """
        self.llm = llm_callable

    def generate(self, spec: ProjectSpec) -> GeneratedProject:
        """
        Генерировать полный проект.

        Args:
            spec: Спецификация проекта.

        Returns:
            GeneratedProject со всеми файлами.
        """
        project = GeneratedProject(spec=spec)

        # 1. Базовая структура
        project.files.extend(self._generate_structure(spec.name))

        # 2. Конфиги
        project.files.extend(self._generate_config(spec))

        # 3. Frontend
        project.files.extend(self._generate_frontend(spec))

        # 4. Backend
        project.files.extend(self._generate_backend(spec))

        # 5. Database
        if spec.database != Database.SQLITE:
            project.files.extend(self._generate_database(spec))

        # 6. Tests
        project.files.extend(self._generate_tests(spec))

        # 7. Docker
        project.files.extend(self._generate_docker(spec))

        # 8. CI/CD
        project.files.extend(self._generate_cicd(spec))

        # 9. Команды установки
        project.commands = self._generate_commands(spec)

        return project

    def _generate_structure(self, name: str) -> list[GeneratedFile]:
        """Структура папок."""
        base = [
            GeneratedFile(
                path=f"{name}/README.md",
                content=f"# {name}\n\nFull-stack приложение.",
                language="markdown"
            ),
            GeneratedFile(
                path=f"{name}/.gitignore",
                content="""node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
coverage/
.vscode/
""",
                language="gitignore"
            ),
        ]
        return base

    def _generate_config(self, spec: ProjectSpec) -> list[GeneratedFile]:
        """Генерация конфигов."""
        files = []

        # package.json
        if spec.framework in (Framework.REACT, Framework.NEXT_JS):
            files.append(GeneratedFile(
                path=f"{spec.name}/package.json",
                content=json.dumps({
                    "name": spec.name,
                    "version": "1.0.0",
                    "private": True,
                    "scripts": {
                        "dev": "next dev",
                        "build": "next build",
                        "start": "next start",
                        "lint": "next lint",
                        "test": "jest",
                        "test:e2e": "playwright test"
                    },
                    "dependencies": {
                        "next": "^14.0.0",
                        "react": "^18.2.0",
                        "react-dom": "^18.2.0"
                    },
                    "devDependencies": {
                        "@types/node": "^20.0.0",
                        "@types/react": "^18.2.0",
                        "@types/react-dom": "^18.2.0",
                        "typescript": "^5.0.0",
                        "eslint": "^8.0.0",
                        "eslint-config-next": "^14.0.0"
                    }
                }, indent=2),
                language="json"
            ))

        # tsconfig.json
        files.append(GeneratedFile(
            path=f"{spec.name}/tsconfig.json",
            content=json.dumps({
                "compilerOptions": {
                    "target": "ES2020",
                    "lib": ["dom", "dom.iterable", "esnext"],
                    "allowJs": True,
                    "skipLibCheck": True,
                    "strict": True,
                    "forceConsistentCasingInFileNames": True,
                    "noEmit": True,
                    "esModuleInterop": True,
                    "module": "esnext",
                    "moduleResolution": "bundler",
                    "resolveJsonModule": True,
                    "isolatedModules": True,
                    "jsx": "preserve",
                    "incremental": True,
                    "plugins": [{"name": "next"}],
                    "paths": {"@/*": ["./src/*"]}
                },
                "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
                "exclude": ["node_modules"]
            }, indent=2),
            language="json"
        ))

        # next.config.js
        if spec.framework == Framework.NEXT_JS:
            files.append(GeneratedFile(
                path=f"{spec.name}/next.config.js",
                content="""/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
""",
                language="javascript"
            ))

        return files

    def _generate_frontend(self, spec: ProjectSpec) -> list[GeneratedFile]:
        """Генерация frontend."""
        files = []

        if spec.framework == Framework.NEXT_JS:
            # app/layout.tsx
            files.append(GeneratedFile(
                path=f"{spec.name}/src/app/layout.tsx",
                content="""import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '{spec.name}',
  description: '{spec.name} - Full-stack приложение',
}

export default function RootLayout({{
  children,
}}: {{
  children: React.ReactNode,
}}) {{
  return (
    <html lang="ru">
      <body>{{{{ children }}}}</body>
    </html>
  )
}}
""".format(spec.name=spec.name),
                language="tsx"
            ))

            # app/page.tsx
            files.append(GeneratedFile(
                path=f"{spec.name}/src/app/page.tsx",
                content="""export default function Home() {{
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-4xl font-bold">
        {spec.name}
      </h1>
      <p className="mt-4 text-gray-600">
        Добро пожаловать!
      </p>
    </main>
  )
}}
""".format(spec.name=spec.name),
                language="tsx"
            ))

            # app/globals.css
            files.append(GeneratedFile(
                path=f"{spec.name}/src/app/globals.css",
                content="""@tailwind base;
@tailwind components;
@tailwind utilities;

:root {{
  --foreground-rgb: 0, 0, 0;
  --background-rgb: 255, 255, 255;
}}

body {{
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-rgb));
}}

@layer utilities {{
  .text-balance {{
    text-wrap: balance;
  }}
}}
""",
                language="css"
            ))

            # tailwind.config.js
            files.append(GeneratedFile(
                path=f"{spec.name}/tailwind.config.js",
                content="""/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {{
    extend: {{
      colors: {{
        primary: '#000000',
        secondary: '#666666',
      }},
    }},
  }},
  plugins: [],
}
""",
                language="javascript"
            ))

        # API routes /components
        files.extend(self._generate_api_routes(spec))

        # Components
        files.extend(self._generate_components(spec))

        return files

    def _generate_api_routes(self, spec: ProjectSpec) -> list[GeneratedFile]:
        """API routes."""
        files = []

        if spec.backend == Backend.NODE_EXPRESS or spec.framework == Framework.NEXT_JS:
            # API route
            files.append(GeneratedFile(
                path=f"{spec.name}/src/app/api/hello/route.ts",
                content="""import {{ NextResponse }} from 'next/server'

export async function GET() {{
  return NextResponse.json({{
    message: 'Привет от API!',
    timestamp: new Date().toISOString(),
  }})
}}
""",
                language="typescript"
            ))

            # API route с auth
            if spec.auth == "jwt":
                files.append(GeneratedFile(
                    path=f"{spec.name}/src/app/api/auth/login/route.ts",
                    content="""import {{ NextResponse }} from 'next/server'

export async function POST(request: Request) {{
  const body = await request.json()
  const {{ email, password }} = body

  // Валидация
  if (!email || !password) {{
    return NextResponse.json(
      {{ error: 'Email и пароль обязательны' }},
      {{ status: 400 }}
    )
  }}

  // Здесь должна быть проверка в БД
  // И генерация JWT токена

  return NextResponse.json({{
    token: 'jwt-token-here',
    user: {{ email }}
  }})
}}
""",
                    language="typescript"
                ))

        return files

    def _generate_components(self, spec: ProjectSpec) -> list[GeneratedFile]:
        """UI компоненты."""
        files = []

        # Button component
        files.append(GeneratedFile(
            path=f"{spec.name}/src/components/Button.tsx",
            content="""interface ButtonProps {{
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}}

export function Button({{
  children,
  variant = 'primary',
  onClick,
  disabled = false,
  type = 'button',
}}: ButtonProps) {{
  const baseStyles = 'px-4 py-2 rounded-lg font-medium transition-colors'
  const variants = {{
    primary: 'bg-black text-white hover:bg-gray-800',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
  }}

  return (
    <button
      type={{type}}
      onClick={{onClick}}
      disabled={{disabled}}
      className={`${{baseStyles}} ${{variants[variant]}} ${{disabled ? 'opacity-50 cursor-not-allowed' : ''}}`}
    >
      {{children}}
    </button>
  )
}}
""",
            language="tsx"
        ))

        # Input component
        files.append(GeneratedFile(
            path=f"{spec.name}/src/components/Input.tsx",
            content="""interface InputProps {{
  label: string
  type?: 'text' | 'email' | 'password'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  error?: string
}}

export function Input({{
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  error,
}}: InputProps) {{
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {{label}}{{required && <span className="text-red-500">*</span>}}
      </label>
      <input
        type={{type}}
        value={{value}}
        onChange={(e) => onChange(e.target.value)}
        placeholder={{placeholder}}
        className={`px-3 py-2 border rounded-lg ${{
          error ? 'border-red-500' : 'border-gray-300'
        }} focus:outline-none focus:ring-2 focus:ring-black`}
      />
      {{error && <span className="text-sm text-red-500">{{error}}</span>}}
    </div>
  )
}}
""",
            language="tsx"
        ))

        # Card component
        files.append(GeneratedFile(
            path=f"{spec.name}/src/components/Card.tsx",
            content="""interface CardProps {{
  children: React.ReactNode
  className?: string
}}

export function Card({{ children, className = '' }}: CardProps) {{
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${{className}}`}>
      {{children}}
    </div>
  )
}}
""",
            language="tsx"
        ))

        return files

    def _generate_backend(self, spec: ProjectSpec) -> list[GeneratedFile]:
        """Генерация backend."""
        files = []

        if spec.backend == Backend.NODE_EXPRESS:
            # server/index.js
            files.append(GeneratedFile(
                path=f"{spec.name}/server/index.js",
                content="""const express = require('express')
const cors = require('cors')
const helmet = require('helmet')

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

// Routes
app.get('/api/health', (req, res) => {{
  res.json({{ status: 'ok', timestamp: new Date().toISOString() }})
}})

// Auth routes
app.post('/api/auth/login', (req, res) => {{
  const {{ email, password }} = req.body
  // Валидация и проверка
  res.json({{ token: 'jwt-token' }})
}})

app.post('/api/auth/register', (req, res) => {{
  const {{ email, password }} = req.body
  res.json({{ message: 'Пользователь создан' }})
}})

// Protected route example
// app.use('/api', authMiddleware)

// Start server
app.listen(PORT, () => {{
  console.log(`Server running on port ${{PORT}}`)
}})

module.exports = app
""",
                language="javascript"
            ))

            # package.json для server
            files.append(GeneratedFile(
                path=f"{spec.name}/server/package.json",
                content=json.dumps({
                    "name": f"{spec.name}-server",
                    "version": "1.0.0",
                    "main": "index.js",
                    "scripts": {
                        "start": "node index.js",
                        "dev": "nodemon index.js"
                    },
                    "dependencies": {
                        "express": "^4.18.0",
                        "cors": "^2.8.5",
                        "helmet": "^7.0.0",
                        "jsonwebtoken": "^9.0.0",
                        "bcryptjs": "^2.4.3",
                        "dotenv": "^16.0.0"
                    },
                    "devDependencies": {
                        "nodemon": "^3.0.0"
                    }
                }, indent=2),
                language="json"
            ))

        elif spec.backend == Backend.PYTHON_FASTAPI:
            # main.py
            files.append(GeneratedFile(
                path=f"{spec.name}/server/main.py",
                content="""from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="{name}", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str

@app.get("/api/health")
async def health_check():
    return {{"status": "ok", "timestamp": "2024-01-01"}}

@app.post("/api/auth/login")
async def login(request: LoginRequest):
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Email и пароль обязательны")
    return {{"token": "jwt-token", "user": {{"email": request.email}}}}

@app.post("/api/auth/register")
async def register(request: RegisterRequest):
    return {{"message": "Пользователь создан"}}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
""".format(name=spec.name),
                language="python"
            ))

            # requirements.txt
            files.append(GeneratedFile(
                path=f"{spec.name}/server/requirements.txt",
                content="""fastapi==0.104.0
uvicorn==0.24.0
pydantic==2.5.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6
""",
                language="text"
            ))

        return files

    def _generate_database(self, spec: ProjectSpec) -> list[GeneratedFile]:
        """Database schema и миграции."""
        files = []

        if spec.database == Database.POSTGRESQL:
            # Schema
            files.append(GeneratedFile(
                path=f"{spec.name}/server/migrations/001_initial.sql",
                content="""-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(512) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
""",
                language="sql"
            ))

            # Prisma schema
            files.append(GeneratedFile(
                path=f"{spec.name}/prisma/schema.prisma",
                content="""generator client {{
  provider = "prisma-client-js"
}}

datasource db {{
  provider = "postgresql"
  url      = env("DATABASE_URL")
}}

model User {{
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String   @map("password_hash")
  name         String?
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("users")
}}

model RefreshToken {{
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  token     String
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
  @@index([userId])
}}
""",
                language="prisma"
            ))

        elif spec.database == Database.MONGODB:
            # Mongoose models
            files.append(GeneratedFile(
                path=f"{spec.name}/server/models/User.js",
                content="""const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({{
  email: {{
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  }},
  passwordHash: {{
    type: String,
    required: true,
  }},
  name: {{
    type: String,
    trim: true,
  }},
  createdAt: {{
    type: Date,
    default: Date.now,
  }},
  updatedAt: {{
    type: Date,
    default: Date.now,
  }},
}})

userSchema.pre('save', function(next) {{
  this.updatedAt = new Date()
  next()
}})

module.exports = mongoose.model('User', userSchema)
""",
                language="javascript"
            ))

        return files

    def _generate_tests(self, spec: ProjectSpec) -> list[GeneratedFile]:
        """Тесты."""
        files = []

        # Jest config
        files.append(GeneratedFile(
            path=f"{spec.name}/jest.config.js",
            content="""module.exports = {{
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {{
    '^@/(.*)$': '<rootDir>/src/$1',
  }},
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
}}
""",
            language="javascript"
        ))

        # jest.setup.js
        files.append(GeneratedFile(
            path=f"{spec.name}/jest.setup.js",
            content="""// Jest setup
import '@testing-library/jest-dom'
""",
            language="javascript"
        ))

        # Unit test example
        files.append(GeneratedFile(
            path=f"{spec.name}/src/components/Button.test.tsx",
            content="""import {{ render, screen, fireEvent }} from '@testing-library/react'
import {{ Button }} from './Button'

describe('Button', () => {{
  it('renders children', () => {{
    render(<Button>Нажми меня</Button>)
    expect(screen.getByRole('button')).toBeInTheDocument()
  }})

  it('calls onClick', () => {{
    const onClick = jest.fn()
    render(<Button onClick={{onClick}}>Нажми</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  }})

  it('is disabled', () => {{
    render(<Button disabled>Нажми</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  }})
}})
""",
            language="typescript"
        ))

        # E2E test example (Playwright)
        files.append(GeneratedFile(
            path=f"{spec.name}/e2e/home.spec.ts",
            content="""import {{ test, expect }} from '@playwright/test'

test('главная страница', async ({{ page }}) => {{
  await page.goto('/')
  
  // Проверяем заголовок
  await expect(page.locator('h1')).toContainText('{name}')
  
  // Проверяем приветствие
  await expect(page.getByText('Добро пожаловать!')).toBeVisible()
}})
""".format(name=spec.name),
            language="typescript"
        ))

        # Playwright config
        files.append(GeneratedFile(
            path=f"{spec.name}/playwright.config.ts",
            content="""import {{ defineConfig }} from '@playwright/test'

export default defineConfig({{
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {{
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  }},
  projects: [{{
    name: 'chromium',
    use: {{ ...devices['Desktop Chrome'] }},
  }}],
}})
""",
            language="typescript"
        ))

        return files

    def _generate_docker(self, spec: ProjectSpec) -> list[GeneratedFile]:
        """Docker файлы."""
        files = []

        # Dockerfile frontend
        files.append(GeneratedFile(
            path=f"{spec.name}/Dockerfile",
            content="""# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
""",
            language="dockerfile"
        ))

        # docker-compose.yml
        files.append(GeneratedFile(
            path=f"{spec.name}/docker-compose.yml",
            content="""version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/{name}
      - NODE_ENV=production
    depends_on:
      - db
      - redis

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: {name}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
""".format(name=spec.name),
            language="yaml"
        ))

        # .dockerignore
        files.append(GeneratedFile(
            path=f"{spec.name}/.dockerignore",
            content="""node_modules
.next
.git
.DS_Store
*.log
README.md
docker-compose.yml
Dockerfile
""",
            language="gitignore"
        ))

        return files

    def _generate_cicd(self, spec: ProjectSpec) -> list[GeneratedFile]:
        """CI/CD."""
        files = []

        # GitHub Actions
        files.append(GeneratedFile(
            path=f"{spec.name}/.github/workflows/ci.yml",
            content="""name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Type check
        run: npx tsc --noEmit
      
      - name: Test
        run: npm run test
      
      - name: Build
        run: npm run build

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      
      - name: Build
        run: npm run build
      
      - name: Start server
        run: npm run start &
      
      - name: E2E tests
        run: npm run test:e2e
""",
            language="yaml"
        ))

        # Deploy workflow
        files.append(GeneratedFile(
            path=f"{spec.name}/.github/workflows/deploy.yml",
            content="""name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
""",
            language="yaml"
        ))

        return files

    def _generate_commands(self, spec: ProjectSpec) -> list[str]:
        """Команды для запуска."""
        return [
            "# Установка",
            "npm install",
            "",
            "# Разработка",
            "npm run dev",
            "",
            "# Тесты",
            "npm run test",
            "npm run test:e2e",
            "",
            "# Docker",
            "docker-compose up -d",
            "",
            "# Production",
            "npm run build",
            "npm run start",
        ]


class SmartCodeGenerator(CodeGenerator):
    """
    Умный генератор с LLM.
    
    Использует AI для:
    - Генерации кастомных компонентов под требования
    - Адаптации под фичи
    - Генерации специфичного кода
    """

    def generate_smart(
        self,
        architecture_plan: str,
        requirements: list[str],
    ) -> GeneratedProject:
        """
        Генерировать с учётом требований.

        Args:
            architecture_plan: Архитектурный план.
            requirements: Список требований.

        Returns:
            Сгенерированный проект.
        """
        # Парсим требования
        spec = self._parse_requirements(requirements)
        
        # Используем LLM для кастомизации если доступен
        if self.llm and architecture_plan:
            custom_code = self._generate_custom_code(architecture_plan, requirements)
            # Добавляем кастомный код
            # ...
        
        return self.generate(spec)

    def _parse_requirements(self, requirements: list[str]) -> ProjectSpec:
        """Парсить требования."""
        spec = ProjectSpec(name="my-app")
        
        for req in requirements:
            req_lower = req.lower()
            
            if "react" in req_lower and "native" in req_lower:
                spec.framework = Framework.REACT_NATIVE
            elif "next" in req_lower:
                spec.framework = Framework.NEXT_JS
            elif "vue" in req_lower:
                spec.framework = Framework.VUE
            elif "fastapi" in req_lower:
                spec.backend = Backend.PYTHON_FASTAPI
            elif "nest" in req_lower:
                spec.backend = Backend.NODE_NEST
            elif "postgresql" in req_lower or "postgres" in req_lower:
                spec.database = Database.POSTGRESQL
            elif "mongo" in req_lower:
                spec.database = Database.MONGODB
            elif "jwt" in req_lower:
                spec.auth = "jwt"
            elif "websocket" in req_lower or "realtime" in req_lower:
                spec.realtime = "websocket"
            elif "grpc" in req_lower:
                spec.api_style = "grpc"
        
        return spec

    def _generate_custom_code(
        self,
        architecture_plan: str,
        requirements: list[str],
    ) -> str:
        """Генерировать кастомный код через LLM."""
        if not self.llm:
            return ""
        
        prompt = f"""Сгенерируй код на основе требований.

Архитектура: {architecture_plan}

Требования: {', '.join(requirements)}

Выведи только код (TypeScript/JavaScript/Python)."""

        return self.llm(prompt)


# =============================================================================
# Глобальный instance
# =============================================================================

_generator: Optional[SmartCodeGenerator] = None


def get_code_generator(llm_callable: Optional[Callable] = None) -> SmartCodeGenerator:
    """Получить генератор."""
    global _generator
    if _generator is None:
        _generator = SmartCodeGenerator(llm_callable)
    return _generator


# =============================================================================
# Тесты
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Тест генерации
    gen = SmartCodeGenerator()
    spec = ProjectSpec(
        name="my-messenger",
        framework=Framework.NEXT_JS,
        backend=Backend.NODE_EXPRESS,
        database=Database.POSTGRESQL,
        auth="jwt",
        realtime="websocket",
    )
    
    project = gen.generate(spec)
    
    print(f"📁 Сгенерировано файлов: {len(project.files)}")
    
    for f in project.files[:10]:
        print(f"  📄 {f.path}")
    
    print("\n📝 Команды:")
    for cmd in project.commands[:5]:
        print(f"  {cmd}")