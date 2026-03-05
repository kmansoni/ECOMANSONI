#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 01: Web Full-Stack Backend
=========================================
Паттерн: FastAPI + SQLAlchemy ORM + JWT + Pydantic + Error handling
Уровень: Production-ready
Архитектурные решения:
  - Stateless JWT авторизация (bearer token, RS256 в проде, HS256 в примере)
  - Dependency Injection через FastAPI Depends
  - Repository абстракция над ORM (отделение бизнес-логики от БД)
  - Centralized error handling через exception handlers
  - Pydantic v2 strict mode для валидации входных данных
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import Column, DateTime, String, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# ---------------------------------------------------------------------------
# Конфигурация (в проде — из env через pydantic-settings)
# ---------------------------------------------------------------------------
DATABASE_URL = "sqlite:///./app.db"  # В проде: postgresql+asyncpg://...
SECRET_KEY = "change-me-in-production-use-env-var"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# ORM-модели
# ---------------------------------------------------------------------------
class Base(DeclarativeBase):
    pass


class UserORM(Base):
    """ORM-модель пользователя. PK — UUID v4, индекс на email."""

    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ---------------------------------------------------------------------------
# Pydantic-схемы (Input / Output разделены — никогда не возвращаем пароль)
# ---------------------------------------------------------------------------
class UserCreate(BaseModel):
    """Входная схема регистрации. Валидация на уровне типов."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=256)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Пароль должен содержать хотя бы одну цифру")
        return v


class UserOut(BaseModel):
    """Выходная схема — никогда не включает hashed_password."""

    id: str
    email: str
    full_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------------------------------------------------------------------------
# Репозиторий — единственная точка работы с БД
# ---------------------------------------------------------------------------
class UserRepository:
    """Инкапсулирует все SQL-запросы к таблице users."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_email(self, email: str) -> UserORM | None:
        return self._session.execute(
            select(UserORM).where(UserORM.email == email)
        ).scalar_one_or_none()

    def get_by_id(self, user_id: str) -> UserORM | None:
        return self._session.get(UserORM, user_id)

    def create(self, email: str, hashed_password: str, full_name: str | None) -> UserORM:
        user = UserORM(email=email, hashed_password=hashed_password, full_name=full_name)
        self._session.add(user)
        self._session.commit()
        self._session.refresh(user)
        return user

    def list_all(self, skip: int = 0, limit: int = 100) -> list[UserORM]:
        return list(
            self._session.execute(select(UserORM).offset(skip).limit(limit)).scalars()
        )


# ---------------------------------------------------------------------------
# Зависимости FastAPI (Dependency Injection)
# ---------------------------------------------------------------------------
def get_db() -> Session:  # type: ignore[return]
    """Генератор сессии БД с гарантированным закрытием."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbDep = Annotated[Session, Depends(get_db)]


def create_access_token(subject: str) -> tuple[str, int]:
    """Создаёт подписанный JWT. Возвращает (token, expires_in_seconds)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {"sub": subject, "exp": expire, "iat": datetime.now(timezone.utc)}
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token, ACCESS_TOKEN_EXPIRE_MINUTES * 60


def get_current_user(request: Request, db: DbDep) -> UserORM:
    """Валидирует Bearer-токен и возвращает текущего пользователя."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Токен не предоставлен")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Токен истёк")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Невалидный токен")

    user = UserRepository(db).get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")
    return user


AuthDep = Annotated[UserORM, Depends(get_current_user)]

# ---------------------------------------------------------------------------
# Приложение FastAPI
# ---------------------------------------------------------------------------
app = FastAPI(title="Training Seed API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(Exception)
async def global_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    """Централизованный обработчик непредвиденных ошибок. Не утекает стектрейс в прод."""
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера"})


# ---------------------------------------------------------------------------
# Роуты
# ---------------------------------------------------------------------------
@app.post("/auth/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: DbDep) -> UserORM:
    """Регистрация нового пользователя. Идемпотентна по email."""
    repo = UserRepository(db)
    if repo.get_by_email(payload.email):
        raise HTTPException(status_code=409, detail="Email уже занят")
    hashed = pwd_context.hash(payload.password)
    return repo.create(payload.email, hashed, payload.full_name)


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbDep) -> TokenResponse:
    """Аутентификация. Возвращает JWT access token."""
    repo = UserRepository(db)
    user = repo.get_by_email(payload.email)
    if not user or not pwd_context.verify(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверные учётные данные")
    token, expires_in = create_access_token(user.id)
    return TokenResponse(access_token=token, expires_in=expires_in)


@app.get("/users/me", response_model=UserOut)
def get_me(current_user: AuthDep) -> UserORM:
    """Возвращает профиль текущего авторизованного пользователя."""
    return current_user


@app.get("/users", response_model=list[UserOut])
def list_users(db: DbDep, _: AuthDep, skip: int = 0, limit: int = 100) -> list[UserORM]:
    """Список пользователей. Требует авторизации. В проде — роль admin."""
    return UserRepository(db).list_all(skip=skip, limit=limit)


# ---------------------------------------------------------------------------
# Точка входа / демонстрация
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    Base.metadata.create_all(bind=engine)
    print("База данных инициализирована. Запуск сервера на http://localhost:8000")
    print("Документация: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
