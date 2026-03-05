#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ContinualTrainer — инкрементальное обучение ARIA с LoRA-адаптерами.
===================================================================

Архитектурные решения:
    1. LoRA (Low-Rank Adaptation): дообучаем только дельта-матрицы (rank=8..32),
       базовые веса заморожены. Предотвращает catastrophic forgetting.
    2. Gradient checkpointing: снижает пиковую память в 3–8× за счёт
       перевычисления активаций при backward pass.
    3. Replay buffer: случайная выборка 10% данных из предыдущих эпох
       для защиты от forgetting (Experience Replay).
    4. EWC penalty (опционально): Elastic Weight Consolidation
       для критических весов безопасности (hardcoded safety gates).
    5. Early stopping: мониторинг validation loss с patience=3.
    6. CheckpointManager: сохраняет N последних чекпоинтов + best model.
    7. Rollback: при деградации качества автоматически откатывается к best.

Безопасность:
    - Safety-frozen layers: веса safety-classifier заморожены всегда.
    - Gradient clipping: max_norm=1.0 (предотвращает gradient explosion).
    - Audit trail: каждый прогон логируется в FeedbackStore.training_runs.

Масштабирование:
    - Single-GPU: DataParallel не нужен для инкрементального обучения.
    - Multi-GPU: ModelParallel / DeepSpeed ZeRO-2 — добавить при >1B параметров.
    - CPU-fallback: автоматически, если CUDA недоступна.

Зависимости:
    torch >= 2.0, опционально transformers (для HF-моделей).
    Если torch недоступен — возвращает graceful no-op с предупреждением.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Sequence

logger = logging.getLogger(__name__)

# Проверяем доступность torch
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import DataLoader, Dataset, RandomSampler
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("torch not installed. ContinualTrainer will run in no-op mode.")


# ─── Config ───────────────────────────────────────────────────────────────────

@dataclass
class TrainingConfig:
    """
    Параметры тренировочного прогона.

    Attributes:
        epochs:          Количество эпох.
        batch_size:      Размер батча (подбирайте под VRAM; 4-8 для 8GB).
        learning_rate:   LR для AdamW (1e-4 хорошо для LoRA).
        max_grad_norm:   Clipper градиентов.
        lora_rank:       Ранг LoRA матриц (8 — баланс качество/скорость).
        lora_alpha:      Масштабирование LoRA (=lora_rank обычно).
        replay_fraction: Доля данных из replay buffer.
        patience:        Early stopping patience (эпохи без улучшения).
        checkpoint_dir:  Директория чекпоинтов.
        max_checkpoints: Максимум хранимых чекпоинтов.
        device:          "cuda" | "cpu" | "auto".
        grad_checkpoint: Включить gradient checkpointing.
    """

    epochs:           int   = 3
    batch_size:       int   = 4
    learning_rate:    float = 1e-4
    max_grad_norm:    float = 1.0
    lora_rank:        int   = 8
    lora_alpha:       int   = 8
    replay_fraction:  float = 0.1
    patience:         int   = 3
    checkpoint_dir:   str   = "checkpoints/aria"
    max_checkpoints:  int   = 5
    device:           str   = "auto"
    grad_checkpoint:  bool  = True


# ─── LoRA Layer ───────────────────────────────────────────────────────────────

if TORCH_AVAILABLE:
    class LoRALinear(nn.Module):
        """
        LoRA-обёртка над nn.Linear.
        Добавляет дельта W = B @ A, где rank(A) = rank(B) = r << min(in, out).
        Базовые веса W заморожены.

        forward: y = x @ W.T + x @ A.T @ B.T * (alpha / r)

        Параметры:
            in_features:  Размерность входа.
            out_features: Размерность выхода.
            rank:         Ранг адаптера.
            alpha:        Масштабирующий коэффициент.
        """

        def __init__(
            self,
            in_features: int,
            out_features: int,
            rank: int = 8,
            alpha: int = 8,
        ) -> None:
            super().__init__()
            self.rank = rank
            self.alpha = alpha
            self.scaling = alpha / rank

            # Замороженные базовые веса
            self.weight = nn.Parameter(
                torch.zeros(out_features, in_features), requires_grad=False
            )
            self.bias: Optional[nn.Parameter] = None

            # LoRA адаптер (обучаемые)
            self.lora_A = nn.Parameter(torch.randn(rank, in_features) * 0.01)
            self.lora_B = nn.Parameter(torch.zeros(out_features, rank))

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            base = nn.functional.linear(x, self.weight, self.bias)
            lora_delta = nn.functional.linear(
                nn.functional.linear(x, self.lora_A), self.lora_B
            ) * self.scaling
            return base + lora_delta

        @classmethod
        def from_linear(
            cls, linear: "nn.Linear", rank: int = 8, alpha: int = 8
        ) -> "LoRALinear":
            """Создать LoRALinear из существующего Linear, скопировав веса."""
            lora = cls(linear.in_features, linear.out_features, rank, alpha)
            with torch.no_grad():
                lora.weight.copy_(linear.weight)
                if linear.bias is not None:
                    lora.bias = nn.Parameter(linear.bias.clone(), requires_grad=False)
            return lora

    # ─── Dataset ─────────────────────────────────────────────────────────────

    class TextDataset(Dataset):
        """
        PyTorch Dataset для языкового моделирования (causal LM).
        Использует BPE-токенизатор ARIA.
        """

        def __init__(
            self,
            texts: list[str],
            tokenizer,
            max_length: int = 512,
        ) -> None:
            self._samples: list[torch.Tensor] = []
            for text in texts:
                try:
                    ids = tokenizer.encode(text)
                    if len(ids) < 8:
                        continue
                    # Truncate
                    ids = ids[:max_length]
                    self._samples.append(torch.tensor(ids, dtype=torch.long))
                except Exception:
                    continue

        def __len__(self) -> int:
            return len(self._samples)

        def __getitem__(self, idx: int) -> torch.Tensor:
            return self._samples[idx]

    def _collate_fn(batch: list[torch.Tensor]) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Pad батч до одинаковой длины.
        Returns: (input_ids, labels) — labels сдвинуты на +1 (causal LM objective).
        """
        max_len = max(t.size(0) for t in batch)
        padded = torch.full((len(batch), max_len), 0, dtype=torch.long)
        for i, seq in enumerate(batch):
            padded[i, : seq.size(0)] = seq

        # Causal LM: predict next token
        inputs = padded[:, :-1]
        labels = padded[:, 1:].clone()
        # Pad positions → -100 (игнорируются CrossEntropy)
        labels[padded[:, 1:] == 0] = -100
        return inputs, labels


# ─── Checkpoint Manager ───────────────────────────────────────────────────────

class CheckpointManager:
    """
    Управляет сохранением и ротацией чекпоинтов.
    Хранит max_keep последних + best by validation loss.

    Format: {checkpoint_dir}/run_{run_id}/epoch_{n}.pt
            {checkpoint_dir}/run_{run_id}/best.pt
            {checkpoint_dir}/run_{run_id}/meta.json
    """

    def __init__(self, checkpoint_dir: str, max_keep: int = 5) -> None:
        self._dir = Path(checkpoint_dir)
        self._max_keep = max_keep
        self._checkpoints: list[Path] = []
        self._best_loss: float = float("inf")
        self._best_path: Optional[Path] = None

    def save(
        self,
        model_state: dict,
        optimizer_state: dict,
        run_id: str,
        epoch: int,
        val_loss: float,
    ) -> Path:
        """Сохранить чекпоинт. Возвращает путь к файлу."""
        run_dir = self._dir / f"run_{run_id}"
        run_dir.mkdir(parents=True, exist_ok=True)

        path = run_dir / f"epoch_{epoch:04d}.pt"

        if TORCH_AVAILABLE:
            torch.save({
                "model_state_dict": model_state,
                "optimizer_state_dict": optimizer_state,
                "epoch": epoch,
                "val_loss": val_loss,
                "run_id": run_id,
                "timestamp": time.time(),
            }, str(path))

        self._checkpoints.append(path)

        # Ротация: удалить старые
        while len(self._checkpoints) > self._max_keep:
            old = self._checkpoints.pop(0)
            try:
                old.unlink()
            except OSError:
                pass

        # Best model
        if val_loss < self._best_loss:
            self._best_loss = val_loss
            best_path = run_dir / "best.pt"
            if TORCH_AVAILABLE:
                torch.save({
                    "model_state_dict": model_state,
                    "val_loss": val_loss,
                    "epoch": epoch,
                }, str(best_path))
            self._best_path = best_path

        # Метаданные
        meta = {
            "run_id": run_id,
            "epoch": epoch,
            "val_loss": val_loss,
            "best_loss": self._best_loss,
            "best_path": str(self._best_path),
        }
        (run_dir / "meta.json").write_text(json.dumps(meta, indent=2))
        return path

    def load_best(self) -> Optional[dict]:
        """Загрузить best checkpoint state dict."""
        if self._best_path and self._best_path.exists() and TORCH_AVAILABLE:
            return torch.load(str(self._best_path), map_location="cpu")
        return None


# ─── ContinualTrainer ─────────────────────────────────────────────────────────

class ContinualTrainer:
    """
    Инкрементальный тренер для ARIA GPT-модели с LoRA.

    Usage:
        trainer = ContinualTrainer(config, model, tokenizer, feedback_store)
        result = trainer.train(new_texts)

    Rollback:
        При деградации: trainer.rollback()

    No-op mode:
        Если torch недоступен — все методы возвращают заглушки с logом.
    """

    def __init__(
        self,
        config: TrainingConfig,
        model=None,
        tokenizer=None,
        feedback_store=None,
    ) -> None:
        self._config = config
        self._model = model
        self._tokenizer = tokenizer
        self._feedback_store = feedback_store
        self._replay_buffer: list[str] = []
        self._ckpt_manager = CheckpointManager(
            config.checkpoint_dir, max_keep=config.max_checkpoints
        )
        self._device = self._resolve_device(config.device)
        self._run_id: Optional[str] = None

    @staticmethod
    def _resolve_device(device: str) -> str:
        if not TORCH_AVAILABLE:
            return "cpu"
        if device == "auto":
            return "cuda" if torch.cuda.is_available() else "cpu"
        return device

    def _inject_lora(self, model: "nn.Module", rank: int, alpha: int) -> "nn.Module":
        """
        Заменить все nn.Linear в attention-слоях на LoRALinear.
        Имена слоёв: c_attn, c_proj, q_proj, k_proj, v_proj, out_proj.
        """
        TARGET_NAMES = {"c_attn", "c_proj", "q_proj", "k_proj", "v_proj", "out_proj"}
        for name, module in list(model.named_modules()):
            parent_name, _, child_name = name.rpartition(".")
            if child_name in TARGET_NAMES and isinstance(module, nn.Linear):
                parent = model
                for part in parent_name.split("."):
                    if part:
                        parent = getattr(parent, part)
                lora_layer = LoRALinear.from_linear(module, rank=rank, alpha=alpha)
                setattr(parent, child_name, lora_layer)
                logger.debug("Injected LoRA into %s", name)
        return model

