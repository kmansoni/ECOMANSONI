"""GPT + BPE интеграционный пайплайн.

Объединяет BPETokenizer с GPTLanguageModel для full end-to-end обучения
и инференса с subword tokenization.

Совместимость:
    - BPETokenizer — drop-in замена CharTokenizer
    - TransformerConfig и GPTLanguageModel импортируются без изменений
    - Добавляет BPETrainConfig для управления токенизацией

Ключевые отличия от CharTokenizer пайплайна:
    1. vocab_size может быть 1000–50000 (vs. 100–300 у char-level)
    2. Последовательности короче (subword эффективнее char)
    3. Требует предварительного обучения токенизатора на corpus
    4. Roundtrip consistency: encode(decode(ids)) == ids (гарантирована)

Использование:
    # 1. Обучить токенизатор
    train_bpe_and_gpt(corpus_text, num_merges=2000, gpt_epochs=50)

    # 2. Или загрузить готовый
    pipeline = BPEGPTPipeline.load("checkpoints/")
    text = pipeline.generate("The transformer", max_new_tokens=200)
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset

# Детерминированный импорт: пакетный режим в составе ai_engine,
# прямой импорт только при запуске файла как standalone script.
if __package__:
    from .bpe_tokenizer import BPETokenizer
    from .transformer_text_generator import (
        GPTLanguageModel,
        TextGenerator,
        TransformerConfig,
    )
else:
    from bpe_tokenizer import BPETokenizer
    from transformer_text_generator import (
        GPTLanguageModel,
        TextGenerator,
        TransformerConfig,
    )


# ── Конфигурация ──────────────────────────────────────────────────────────────

@dataclass
class BPETrainConfig:
    """Конфигурация BPE + GPT обучения.

    Attributes:
        num_merges:        Количество BPE merge операций.
                           Итоговый vocab ≈ 260 + num_merges.
        min_corpus_chars:  Минимальная длина корпуса для BPE (предупреждение).
        gpt_vocab_size:    Устанавливается автоматически после train_bpe().
        checkpoint_dir:    Директория для сохранения чекпоинтов.
    """

    num_merges: int = 2000
    min_corpus_chars: int = 5000
    gpt_vocab_size: int = 0  # заполняется после train_bpe()
    checkpoint_dir: str = "checkpoints"


# ── Dataset для BPE-токенизованного текста ────────────────────────────────────

class BPETextDataset(Dataset):
    """Dataset из предварительно токенизованной последовательности.

    Стратегия: один большой flat список token IDs → нарезаем на overlapping chunks.
    Stride = seq_len // 2: каждый токен участвует в обучении из двух контекстов.

    Args:
        token_ids:  Предтокенизованная последовательность.
        seq_len:    Длина контекстного окна модели.
        stride:     Шаг сдвига окна. По умолчанию stride = seq_len (non-overlapping).
    """

    def __init__(
        self,
        token_ids: list[int],
        seq_len: int,
        stride: Optional[int] = None,
    ) -> None:
        self.seq_len = seq_len
        self.stride = stride or seq_len
        # Flat tensor — всё в памяти (для корпусов < 50M tokens)
        self.data = torch.tensor(token_ids, dtype=torch.long)

    def __len__(self) -> int:
        if len(self.data) <= self.seq_len:
            return 0
        return (len(self.data) - self.seq_len - 1) // self.stride + 1

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        start = idx * self.stride
        end = start + self.seq_len
        x = self.data[start:end]
        y = self.data[start + 1 : end + 1]
        return x, y


# ── Обёртка пайплайна ─────────────────────────────────────────────────────────

class BPEGPTPipeline:
    """End-to-end пайплайн BPE токенизация + GPT модель.

    Методы:
        train_bpe(corpus) → Обучить токенизатор.
        train_gpt(corpus) → Обучить GPT на токенизованном корпусе.
        generate(prompt)  → Сгенерировать текст.
        save(dir)         → Сохранить токенизатор + веса модели.
        load(dir)         → Восстановить из директории.
    """

    def __init__(
        self,
        bpe_config: Optional[BPETrainConfig] = None,
        gpt_config: Optional[TransformerConfig] = None,
    ) -> None:
        self.bpe_config = bpe_config or BPETrainConfig()
        self.tokenizer = BPETokenizer()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model: Optional[GPTLanguageModel] = None
        self.gpt_config: Optional[TransformerConfig] = gpt_config

    def train_bpe(self, corpus: str) -> None:
        """Обучить BPE токенизатор на корпусе.

        Предупреждение при коротком корпусе (недостаточно статистики для merge rules).
        """
        if len(corpus) < self.bpe_config.min_corpus_chars:
            print(
                f"[WARNING] Corpus is short ({len(corpus)} chars < "
                f"{self.bpe_config.min_corpus_chars}). BPE quality may be poor."
            )

        print(f"[BPEGPTPipeline] Training BPE: num_merges={self.bpe_config.num_merges}")
        self.tokenizer.train(corpus, num_merges=self.bpe_config.num_merges)
        self.bpe_config.gpt_vocab_size = self.tokenizer.vocab_size
        print(f"[BPEGPTPipeline] BPE vocab_size = {self.tokenizer.vocab_size}")

    def train_gpt(
        self,
        corpus: str,
        epochs: Optional[int] = None,
        batch_size: Optional[int] = None,
    ) -> GPTLanguageModel:
        """Обучить GPT на BPE-токенизованном корпусе.

        Требует предварительного вызова train_bpe().

        Args:
            corpus:     Обучающий текст.
            epochs:     Переопределить количество эпох.
            batch_size: Переопределить размер батча.

        Returns:
            Обученная GPTLanguageModel.
        """
        if self.tokenizer.vocab_size <= 260:
            raise RuntimeError(
                "[BPEGPTPipeline] BPE not trained yet. Call train_bpe(corpus) first."
            )

        # Токенизируем весь корпус
        print("[BPEGPTPipeline] Tokenizing corpus...")
        token_ids = self.tokenizer.encode(corpus, add_bos=True, add_eos=True)
        print(f"[BPEGPTPipeline] Corpus: {len(corpus)} chars → {len(token_ids)} tokens "
              f"(ratio: {len(token_ids)/len(corpus):.2f})")

        # Конфиг GPT: vocab_size из BPE
        if self.gpt_config is None:
            self.gpt_config = TransformerConfig(
                vocab_size=self.tokenizer.vocab_size,
                d_model=256,
                n_heads=8,
                n_layers=4,
                d_ff=1024,
                max_seq_len=256,
                dropout=0.1,
                learning_rate=3e-4,
                batch_size=batch_size or 32,
                num_epochs=epochs or 30,
                warmup_steps=200,
                weight_decay=0.01,
                grad_clip=1.0,
            )
        else:
            self.gpt_config.vocab_size = self.tokenizer.vocab_size
            if epochs:
                self.gpt_config.num_epochs = epochs
            if batch_size:
                self.gpt_config.batch_size = batch_size

        # Dataset + DataLoader
        dataset = BPETextDataset(token_ids, seq_len=self.gpt_config.max_seq_len)
        if len(dataset) == 0:
            raise ValueError(
                f"[BPEGPTPipeline] Dataset is empty: corpus too short for seq_len={self.gpt_config.max_seq_len}. "
                f"Need at least {self.gpt_config.max_seq_len + 1} tokens, got {len(token_ids)}."
            )

        dataloader = DataLoader(
            dataset,
            batch_size=self.gpt_config.batch_size,
            shuffle=True,
            num_workers=0,
            pin_memory=self.device.type == "cuda",
        )

        # Модель
        self.model = GPTLanguageModel(self.gpt_config).to(self.device)
        n_params = sum(p.numel() for p in self.model.parameters() if p.requires_grad)
        print(f"[BPEGPTPipeline] Model: {n_params:,} parameters on {self.device}")

        # Optimizer + LR schedule
        optimizer = optim.AdamW(
            self.model.parameters(),
            lr=self.gpt_config.learning_rate,
            weight_decay=self.gpt_config.weight_decay,
            betas=(0.9, 0.95),  # GPT-style betas
        )

        total_steps = len(dataloader) * self.gpt_config.num_epochs
        scheduler = _build_lr_scheduler(optimizer, self.gpt_config.warmup_steps, total_steps)

        # Training loop
        criterion = nn.CrossEntropyLoss(ignore_index=self.tokenizer.pad_id)
        self.model.train()
        global_step = 0

        for epoch in range(1, self.gpt_config.num_epochs + 1):
            epoch_loss = 0.0
            num_batches = 0

            for x_batch, y_batch in dataloader:
                x_batch = x_batch.to(self.device)
                y_batch = y_batch.to(self.device)

                optimizer.zero_grad(set_to_none=True)

                logits = self.model(x_batch)  # (B, T, vocab_size)
                # Reshape for CrossEntropyLoss: (B*T, vocab_size) vs (B*T,)
                loss = criterion(
                    logits.view(-1, self.gpt_config.vocab_size),
                    y_batch.view(-1),
                )

                loss.backward()
                nn.utils.clip_grad_norm_(self.model.parameters(), self.gpt_config.grad_clip)
                optimizer.step()
                scheduler.step()

                epoch_loss += loss.item()
                num_batches += 1
                global_step += 1

            avg_loss = epoch_loss / max(num_batches, 1)
            perplexity = torch.exp(torch.tensor(avg_loss)).item()

            if epoch % 5 == 0 or epoch == 1:
                print(
                    f"  Epoch {epoch:3d}/{self.gpt_config.num_epochs} | "
                    f"loss={avg_loss:.4f} | ppl={perplexity:.1f} | "
                    f"lr={scheduler.get_last_lr()[0]:.2e}"
                )

        print(f"[BPEGPTPipeline] Training complete.")
        return self.model

    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 200,
        temperature: float = 0.8,
        top_k: int = 50,
        top_p: float = 0.9,
    ) -> str:
        """Сгенерировать текст по подсказке.

        Args:
            prompt:         Начало текста.
            max_new_tokens: Максимум новых токенов.
            temperature:    Sampling temperature (0 = greedy).
            top_k:          Top-k sampling (0 = disabled).
            top_p:          Nucleus sampling (1.0 = disabled).

        Returns:
            Сгенерированный текст (включая prompt).
        """
        if self.model is None:
            raise RuntimeError("[BPEGPTPipeline] Model not trained. Call train_gpt() first.")

        generator = TextGenerator(self.model, self.tokenizer, self.device)
        return generator.generate(
            prompt,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_k=top_k,
            top_p=top_p,
        )

    def save(self, directory: str | Path) -> None:
        """Сохранить пайплайн: токенизатор + веса модели + конфиг."""
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)

        # Токенизатор
        self.tokenizer.save(directory / "tokenizer.json")

        # Веса модели
        if self.model is not None:
            torch.save(self.model.state_dict(), directory / "model.pt")

        # Конфиг модели
        if self.gpt_config is not None:
            config_dict = {k: v for k, v in self.gpt_config.__dict__.items()}
            (directory / "gpt_config.json").write_text(
                json.dumps(config_dict, indent=2), encoding="utf-8"
            )

        print(f"[BPEGPTPipeline] Saved to {directory}/")

    @classmethod
    def load(cls, directory: str | Path) -> "BPEGPTPipeline":
        """Загрузить пайплайн из директории."""
        directory = Path(directory)

        # Конфиг
        config_path = directory / "gpt_config.json"
        if not config_path.exists():
            raise FileNotFoundError(f"gpt_config.json not found in {directory}")
        config_data = json.loads(config_path.read_text(encoding="utf-8"))
        gpt_config = TransformerConfig(**config_data)

        # Токенизатор
        tokenizer = BPETokenizer.load(directory / "tokenizer.json")

        pipeline = cls(gpt_config=gpt_config)
        pipeline.tokenizer = tokenizer
        pipeline.bpe_config.gpt_vocab_size = tokenizer.vocab_size

        # Веса модели
        model_path = directory / "model.pt"
        if model_path.exists():
            pipeline.model = GPTLanguageModel(gpt_config).to(pipeline.device)
            state = torch.load(model_path, map_location=pipeline.device, weights_only=True)
            pipeline.model.load_state_dict(state)
            pipeline.model.eval()
            print(f"[BPEGPTPipeline] Model loaded from {directory}/")
        else:
            print(f"[BPEGPTPipeline] WARNING: model.pt not found in {directory}/")

        return pipeline


# ── Вспомогательные функции ────────────────────────────────────────────────────

def _build_lr_scheduler(
    optimizer: optim.Optimizer,
    warmup_steps: int,
    total_steps: int,
) -> optim.lr_scheduler.LambdaLR:
    """Cosine LR schedule с linear warmup.

    lr(t) = lr_peak × min(t/warmup, 0.5×(1+cos(π×(t-warmup)/(total-warmup))))
    """
    import math

    def lr_lambda(step: int) -> float:
        if step < warmup_steps:
            return step / max(warmup_steps, 1)
        progress = (step - warmup_steps) / max(total_steps - warmup_steps, 1)
        return 0.5 * (1.0 + math.cos(math.pi * progress))

    return optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)


def train_bpe_and_gpt(
    corpus: str,
    num_merges: int = 2000,
    gpt_epochs: int = 30,
    output_dir: str = "checkpoints/bpe_gpt",
) -> BPEGPTPipeline:
    """Convenience function: полный цикл обучения BPE + GPT.

    Args:
        corpus:     Обучающий текст.
        num_merges: Количество BPE merge operations.
        gpt_epochs: Количество эпох обучения GPT.
        output_dir: Директория для сохранения чекпоинтов.

    Returns:
        Обученный BPEGPTPipeline готовый к инференсу.
    """
    pipeline = BPEGPTPipeline(bpe_config=BPETrainConfig(num_merges=num_merges))

    print("Step 1/2: Training BPE tokenizer...")
    pipeline.train_bpe(corpus)

    print("\nStep 2/2: Training GPT language model...")
    pipeline.train_gpt(corpus, epochs=gpt_epochs)

    pipeline.save(output_dir)
    return pipeline


# ── Demo ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    CORPUS = """
    Transformers are the backbone of modern natural language processing systems.
    The attention mechanism allows the model to focus on relevant parts of the input.
    Byte pair encoding creates subword tokens by merging frequent character pairs.
    Neural networks learn representations through gradient descent optimization.
    Language models predict the next token given the previous context window.
    The decoder-only architecture processes tokens left to right autoregressively.
    Positional encodings inject information about token positions into embeddings.
    Feed-forward layers apply non-linear transformations after the attention block.
    Layer normalization stabilizes training by normalizing activations per layer.
    Weight tying shares embedding weights with the output projection head.
    """ * 50

    # Полный пайплайн
    pipeline = train_bpe_and_gpt(
        corpus=CORPUS,
        num_merges=300,
        gpt_epochs=20,
        output_dir="/tmp/bpe_gpt_demo",
    )

    print("\n=== Generation ===")
    for prompt in ["The transformer", "Byte pair", "Neural networks"]:
        result = pipeline.generate(prompt, max_new_tokens=80, temperature=0.7)
        print(f"\nPrompt: {prompt!r}")
        print(f"Output: {result!r}")

    # Load roundtrip
    print("\n=== Load roundtrip ===")
    loaded_pipeline = BPEGPTPipeline.load("/tmp/bpe_gpt_demo")
    result2 = loaded_pipeline.generate("The transformer", max_new_tokens=50, temperature=0.7)
    print(f"Loaded output: {result2!r}")
