# Transformer Text Generator

Полная реализация генератора текста на архитектуре **GPT (Decoder-Only Transformer)**. Написана с нуля на чистом PyTorch без дополнительных ML-библиотек.

---

## Установка

```bash
pip install -r ai_engine/requirements.txt
```

Требуется Python 3.9+ и PyTorch 2.0+. CUDA опциональна — модель автоматически переключается на CPU.

---

## Быстрый старт

```bash
python ai_engine/transformer_text_generator.py
```

Скрипт сам обучит модель на встроенном примере текста (~10 абзацев) и выведет три варианта генерации.

---

## Архитектура

### Токенизатор (`CharTokenizer`)
- Character-level: каждый символ = один токен
- Специальные токены: `<PAD>` (0), `<BOS>` (1), `<EOS>` (2), `<UNK>` (3)
- Словарь строится динамически из обучающего корпуса

### Модель (`GPTLanguageModel`)

```
Input IDs (B, T)
    ↓
Token Embedding (vocab_size → d_model)
    ↓
+ Sinusoidal Positional Encoding
    ↓
[TransformerBlock × N]
    ├── LayerNorm (Pre-LN)
    ├── Multi-Head Causal Self-Attention
    │     ├── Scaled Dot-Product Attention
    │     ├── Causal Mask (upper triangular -inf)
    │     └── Output Projection
    └── LayerNorm + Feed-Forward (GELU)
    ↓
Final LayerNorm
    ↓
Linear Head → Logits (B, T, vocab_size)
```

**Ключевые решения:**
- **Pre-LN** — нормализация перед sub-layer: стабильное обучение без тщательного подбора warmup
- **Weight Tying** — веса `token_emb` и `lm_head` общие: меньше параметров, лучший perplexity
- **Causal Mask** — буфер `(T, T)` с `-inf` в верхнем треугольнике: авторегрессивная генерация
- **Fused QKV** — единый Linear для Q/K/V: один matmul вместо трёх

---

## Параметры конфигурации (`TransformerConfig`)

| Параметр | По умолчанию | Описание |
|---|---|---|
| `vocab_size` | 256 | Размер словаря |
| `d_model` | 256 | Размерность эмбеддингов |
| `n_heads` | 8 | Количество голов внимания |
| `n_layers` | 4 | Количество Transformer-блоков |
| `d_ff` | 1024 | Внутренняя размерность FFN |
| `max_seq_len` | 128 | Размер контекстного окна |
| `dropout` | 0.1 | Dropout для регуляризации |
| `learning_rate` | 3e-4 | Пиковый LR для AdamW |
| `batch_size` | 32 | Размер батча |
| `num_epochs` | 30 | Эпох обучения |
| `warmup_steps` | 100 | Шаги линейного warm-up |
| `weight_decay` | 0.01 | L2-регуляризация |
| `grad_clip` | 1.0 | Макс. норма градиента |

---

## Стратегии генерации

### Temperature sampling
```python
generator.generate(prompt, temperature=0.7, top_k=50)
```
`temperature < 1` → более детерминированный вывод  
`temperature > 1` → более случайный

### Nucleus (Top-p) sampling
```python
generator.generate(prompt, temperature=1.0, top_p=0.9)
```
Выбирает наименьшее множество токенов с суммарной вероятностью ≥ `p`.

### Greedy decoding
```python
generator.generate(prompt, temperature=0.0)
```
Всегда выбирает токен с максимальным logit — детерминированно.

### Repetition penalty
```python
generator.generate(prompt, repetition_penalty=1.2)
```
Делит logit уже сгенерированных токенов на `penalty`, снижая повторы.

---

## Использование как библиотеки

```python
from ai_engine.transformer_text_generator import (
    TransformerConfig, CharTokenizer, TextDataset,
    GPTLanguageModel, TextGenerator, train
)
import torch
from torch.utils.data import DataLoader

tokenizer = CharTokenizer()
tokenizer.build(my_text)

config = TransformerConfig(vocab_size=tokenizer.vocab_size)
config.bos_id = tokenizer.char2id["<BOS>"]

model = GPTLanguageModel(config)
device = torch.device("cpu")
model = model.to(device)

# … обучение …

gen = TextGenerator(model, tokenizer, device)
print(gen.generate("Once upon a time", max_new_tokens=300, temperature=0.8))
```

---

## Математика

### Scaled Dot-Product Attention
```
Attention(Q, K, V) = softmax(Q·Kᵀ / √dₖ) · V
```

### Sinusoidal Positional Encoding
```
PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
```

### LR Schedule
```
lr(t) = lr_peak · min(t/warmup, 0.5·(1 + cos(π·(t−warmup)/(total−warmup))))
```
