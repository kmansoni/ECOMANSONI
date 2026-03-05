"""BPE (Byte Pair Encoding) Tokenizer — production-grade subword tokenization.

Алгоритм:
1. Инициализируем словарь: каждый байт (0–255) = отдельный токен.
2. Итеративно находим пару токенов с наибольшей частотой в corpus.
3. Merges пару → новый токен, записываем правило в merge table.
4. Повторяем num_merges раз.

Encode(text):
    - UTF-8 → bytes
    - Применяем merge rules в порядке их обучения (greedy, left-to-right)
    - Возвращаем список token IDs

Decode(ids):
    - ID → bytes (lookup в vocab)
    - Конкатенируем, декодируем UTF-8 (errors='replace')

Совместимость:
    - drop-in замена CharTokenizer из transformer_text_generator.py
    - vocab_size property, encode()/decode() API совпадает
    - Специальные токены: <PAD>=0, <BOS>=1, <EOS>=2, <UNK>=3

Сериализация:
    - save(path): JSON с merge rules + vocab
    - load(path): восстановление из JSON

Производительность:
    - Чистый Python — O(n · vocab) на обучение, приемлемо для < 50K корпус
    - Для production: реализовать в Rust/C++ (см. tokenizers библиотеку HuggingFace)

Архитектурные решения:
    - Обучение на bytes (не chars): полная поддержка Unicode без UNK для известных символов
    - Greedy encode: стандартный подход BPE (не DP): O(n · num_merges) encode
    - Merge rules хранятся как dict для O(1) lookup при encoding
    - Vocab хранится как dict[int, bytes] для O(1) decode
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Optional

# ── Special token IDs (зафиксированы, не смещаются при обучении) ─────────────
PAD_ID = 0
BOS_ID = 1
EOS_ID = 2
UNK_ID = 3

SPECIAL_TOKENS: dict[str, int] = {
    "<PAD>": PAD_ID,
    "<BOS>": BOS_ID,
    "<EOS>": EOS_ID,
    "<UNK>": UNK_ID,
}

# Offset: bytes 0–255 начинаются с ID=4 чтобы не конфликтовать со special tokens
_BYTE_OFFSET = len(SPECIAL_TOKENS)  # 4


class BPETokenizer:
    """Byte Pair Encoding токенизатор с байтовой базой словаря.

    Attributes:
        vocab:        dict[int, bytes] — ID → bytes sequence
        vocab_inv:    dict[bytes, int] — bytes sequence → ID (reverse index)
        merges:       list[tuple[int, int]] — merge rules в порядке обучения
        merge_index:  dict[tuple[int, int], int] — пара→новый ID (O(1) lookup при encode)
    """

    def __init__(self) -> None:
        # Базовый словарь: специальные токены + 256 однобайтовых токенов
        self.vocab: dict[int, bytes] = {}
        self.vocab_inv: dict[bytes, int] = {}
        self.merges: list[tuple[int, int]] = []
        self.merge_index: dict[tuple[int, int], int] = {}
        self._initialize_base_vocab()

    # ─── Инициализация ────────────────────────────────────────────────────────

    def _initialize_base_vocab(self) -> None:
        """Заполнить словарь специальными токенами и 256 байтами."""
        self.vocab.clear()
        self.vocab_inv.clear()

        # Специальные токены (фиксированные ID 0–3)
        for token_str, token_id in SPECIAL_TOKENS.items():
            token_bytes = token_str.encode("utf-8")
            self.vocab[token_id] = token_bytes
            self.vocab_inv[token_bytes] = token_id

        # Байтовые токены (ID 4–259)
        for byte_val in range(256):
            token_id = byte_val + _BYTE_OFFSET
            token_bytes = bytes([byte_val])
            self.vocab[token_id] = token_bytes
            self.vocab_inv[token_bytes] = token_id

    # ─── Обучение ─────────────────────────────────────────────────────────────

    def train(self, corpus: str, num_merges: int = 1000) -> None:
        """Обучить BPE на корпусе текста.

        Args:
            corpus:     Обучающий текст (unicode str).
            num_merges: Количество merge операций = количество новых токенов
                        сверх базовых 260 (4 спец + 256 байт).
                        Итоговый vocab_size ≤ 260 + num_merges.

        Алгоритм:
            1. Конвертировать corpus → последовательность ID (побайтово).
            2. Построить частотную таблицу пар.
            3. num_merges раз:
                a. Найти пару с max freq.
                b. Создать новый токен = vocab[a] + vocab[b].
                c. Заменить все вхождения (a, b) в corpus на новый ID.
                d. Обновить частоты инкрементально.
        """
        # Сброс merge rules при переобучении
        self.merges = []
        self.merge_index = {}
        self._initialize_base_vocab()

        # Конвертируем в последовательность token IDs
        token_ids: list[int] = self._bytes_to_ids(corpus.encode("utf-8"))

        for step in range(num_merges):
            # Считаем частоты пар
            pair_freqs = _count_pairs(token_ids)
            if not pair_freqs:
                break

            # Лучшая пара по частоте (при равенстве — детерминированный выбор по значению)
            best_pair = max(pair_freqs, key=lambda p: (pair_freqs[p], p))
            if pair_freqs[best_pair] < 2:
                # Нет пар встречающихся хотя бы дважды — стоп
                break

            # Новый токен ID
            new_id = len(self.vocab)
            new_bytes = self.vocab[best_pair[0]] + self.vocab[best_pair[1]]

            self.vocab[new_id] = new_bytes
            self.vocab_inv[new_bytes] = new_id
            self.merges.append(best_pair)
            self.merge_index[best_pair] = new_id

            # Применяем merge к corpus in-place
            token_ids = _merge_pair(token_ids, best_pair, new_id)

            if (step + 1) % 100 == 0:
                print(f"  [BPE] step {step + 1}/{num_merges} | vocab_size={len(self.vocab)}")

        print(f"[BPE] Training complete: {len(self.merges)} merges, vocab_size={self.vocab_size}")

    # ─── Encode / Decode ──────────────────────────────────────────────────────

    def encode(
        self,
        text: str,
        add_bos: bool = False,
        add_eos: bool = False,
        max_length: Optional[int] = None,
    ) -> list[int]:
        """Encode text → список token IDs.

        Args:
            text:       Входной unicode текст.
            add_bos:    Добавить BOS в начало.
            add_eos:    Добавить EOS в конец.
            max_length: Если задано — truncate + добавить EOS перед обрезкой.

        Returns:
            Список integer token IDs.
        """
        token_ids = self._bytes_to_ids(text.encode("utf-8"))
        token_ids = self._apply_merges(token_ids)

        if add_bos:
            token_ids = [BOS_ID] + token_ids
        if add_eos:
            token_ids = token_ids + [EOS_ID]

        if max_length is not None and len(token_ids) > max_length:
            token_ids = token_ids[:max_length]
            if add_eos:
                token_ids[-1] = EOS_ID

        return token_ids

    def decode(self, ids: list[int], skip_special_tokens: bool = True) -> str:
        """Decode список token IDs → unicode text.

        Args:
            ids:                  Список token IDs.
            skip_special_tokens:  Если True — пропустить PAD/BOS/EOS/UNK.

        Returns:
            Декодированный unicode текст.
        """
        special_ids = set(SPECIAL_TOKENS.values()) if skip_special_tokens else set()
        byte_parts: list[bytes] = []
        for token_id in ids:
            if token_id in special_ids:
                continue
            token_bytes = self.vocab.get(token_id)
            if token_bytes is None:
                token_bytes = b"\xef\xbf\xbd"  # UTF-8 replacement char U+FFFD
            byte_parts.append(token_bytes)
        return b"".join(byte_parts).decode("utf-8", errors="replace")

    def encode_batch(
        self,
        texts: list[str],
        add_bos: bool = False,
        add_eos: bool = False,
        pad_to_max: bool = True,
        max_length: Optional[int] = None,
    ) -> list[list[int]]:
        """Encode batch of texts с опциональным padding до max length.

        Args:
            texts:       Список строк.
            pad_to_max:  Если True — выравнивает все последовательности по длинной.
            max_length:  Принудительная длина (иначе — max в батче).

        Returns:
            List[List[int]] — padded batch.
        """
        encoded = [
            self.encode(t, add_bos=add_bos, add_eos=add_eos, max_length=max_length)
            for t in texts
        ]
        if not pad_to_max:
            return encoded

        target_len = max_length or max(len(e) for e in encoded)
        return [e + [PAD_ID] * (target_len - len(e)) for e in encoded]

    # ─── Properties ───────────────────────────────────────────────────────────

    @property
    def vocab_size(self) -> int:
        """Текущий размер словаря."""
        return len(self.vocab)

    @property
    def pad_id(self) -> int:
        return PAD_ID

    @property
    def bos_id(self) -> int:
        return BOS_ID

    @property
    def eos_id(self) -> int:
        return EOS_ID

    @property
    def unk_id(self) -> int:
        return UNK_ID

    # ─── Сериализация ─────────────────────────────────────────────────────────

    def save(self, path: str | Path) -> None:
        """Сохранить токенизатор в JSON.

        Формат:
            {
              "vocab_size": int,
              "vocab": {"<id>": "<hex bytes>", ...},  # hex для бинарных данных
              "merges": [[a, b], ...]                  # merge rules по порядку
            }
        """
        path = Path(path)
        data = {
            "vocab_size": self.vocab_size,
            "vocab": {str(k): v.hex() for k, v in self.vocab.items()},
            "merges": [[a, b] for a, b in self.merges],
        }
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[BPE] Saved to {path} (vocab_size={self.vocab_size}, merges={len(self.merges)})")

    @classmethod
    def load(cls, path: str | Path) -> "BPETokenizer":
        """Восстановить токенизатор из JSON.

        Raises:
            FileNotFoundError: Файл не найден.
            ValueError: Некорректный формат файла.
        """
        path = Path(path)
        data = json.loads(path.read_text(encoding="utf-8"))

        tokenizer = cls.__new__(cls)
        tokenizer.vocab = {int(k): bytes.fromhex(v) for k, v in data["vocab"].items()}
        tokenizer.vocab_inv = {v: int(k) for k, v in data["vocab"].items()}
        tokenizer.merges = [tuple(pair) for pair in data["merges"]]  # type: ignore[misc]
        tokenizer.merge_index = {
            (a, b): tokenizer.vocab_inv[tokenizer.vocab[a] + tokenizer.vocab[b]]
            if (tokenizer.vocab[a] + tokenizer.vocab[b]) in tokenizer.vocab_inv
            else _recompute_merged_id(tokenizer.vocab, a, b)
            for a, b in tokenizer.merges
        }
        print(f"[BPE] Loaded from {path} (vocab_size={tokenizer.vocab_size})")
        return tokenizer

    # ─── Приватные методы ─────────────────────────────────────────────────────

    def _bytes_to_ids(self, data: bytes) -> list[int]:
        """Побайтово конвертировать bytes → начальные token IDs."""
        return [b + _BYTE_OFFSET for b in data]

    def _apply_merges(self, token_ids: list[int]) -> list[int]:
        """Применить все merge rules к последовательности токенов.

        Greedy left-to-right approach:
        Проходим по token_ids, при нахождении известной пары заменяем на merged ID.
        Повторяем пока есть изменения (каждый проход может открыть новые пары).

        Сложность: O(length × |applied_merges|) — приемлемо для inference.
        """
        if not self.merge_index:
            return token_ids

        ids = token_ids[:]
        changed = True
        while changed:
            changed = False
            new_ids: list[int] = []
            i = 0
            while i < len(ids):
                if i < len(ids) - 1:
                    pair = (ids[i], ids[i + 1])
                    merged_id = self.merge_index.get(pair)
                    if merged_id is not None:
                        new_ids.append(merged_id)
                        i += 2
                        changed = True
                        continue
                new_ids.append(ids[i])
                i += 1
            ids = new_ids

        return ids


# ── Вспомогательные функции ────────────────────────────────────────────────────

def _count_pairs(ids: list[int]) -> dict[tuple[int, int], int]:
    """Подсчёт частот всех соседних пар в последовательности."""
    freqs: dict[tuple[int, int], int] = defaultdict(int)
    for i in range(len(ids) - 1):
        freqs[(ids[i], ids[i + 1])] += 1
    return dict(freqs)


def _merge_pair(ids: list[int], pair: tuple[int, int], new_id: int) -> list[int]:
    """Заменить все вхождения pair на new_id в последовательности.

    O(n) — один проход.
    """
    result: list[int] = []
    i = 0
    while i < len(ids):
        if i < len(ids) - 1 and ids[i] == pair[0] and ids[i + 1] == pair[1]:
            result.append(new_id)
            i += 2
        else:
            result.append(ids[i])
            i += 1
    return result


def _recompute_merged_id(vocab: dict[int, bytes], a: int, b: int) -> int:
    """При загрузке пересчитать ID для merge(a, b).

    Используется в load() как fallback если vocab_inv не содержит ключа.
    В корректно сохранённом файле не должен вызываться.
    """
    merged = vocab[a] + vocab[b]
    for k, v in vocab.items():
        if v == merged:
            return k
    raise ValueError(f"Cannot find merged token for pair ({a}, {b})")


# ── Demo / CLI ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    SAMPLE_TEXT = """
    The transformer architecture has revolutionized natural language processing.
    It uses self-attention mechanisms to capture long-range dependencies in text.
    BPE tokenization splits words into subword units, reducing vocabulary size
    while preserving morphological information. The tokenizer learns merge rules
    by iteratively combining the most frequent byte pair into a new token.
    This approach handles rare words and unknown vocabulary gracefully.
    Python provides excellent tooling for building neural network components.
    The tokenizer must balance vocabulary size against sequence length efficiency.
    """ * 20  # Повторяем для большей статистики

    print("=== BPE Tokenizer Demo ===\n")
    tokenizer = BPETokenizer()

    print(f"Base vocab_size: {tokenizer.vocab_size}")
    tokenizer.train(SAMPLE_TEXT, num_merges=500)
    print(f"After training: vocab_size={tokenizer.vocab_size}\n")

    test_sentences = [
        "The transformer architecture",
        "BPE tokenization splits words",
        "Hello, world! 🌍",
    ]

    for sentence in test_sentences:
        ids = tokenizer.encode(sentence, add_bos=True, add_eos=True)
        decoded = tokenizer.decode(ids)
        print(f"Input:   {sentence!r}")
        print(f"Encoded: {ids}")
        print(f"Decoded: {decoded!r}")
        print(f"Tokens:  {len(ids)} (ratio: {len(ids)/len(sentence):.2f} tokens/char)")
        print()

    # Test save/load roundtrip
    save_path = "/tmp/bpe_test.json"
    tokenizer.save(save_path)
    loaded = BPETokenizer.load(save_path)

    test_text = "The transformer architecture"
    original_ids = tokenizer.encode(test_text)
    loaded_ids = loaded.encode(test_text)
    assert original_ids == loaded_ids, f"Roundtrip FAILED: {original_ids} != {loaded_ids}"
    print("✓ Save/load roundtrip: OK")

    # Batch encoding
    batch = tokenizer.encode_batch(
        ["Hello world", "BPE tokenizer", "Transformer"],
        add_bos=True,
        add_eos=True,
        pad_to_max=True,
    )
    print(f"\nBatch encoding (padded to length {len(batch[0])}):")
    for seq in batch:
        print(f"  {seq}")
