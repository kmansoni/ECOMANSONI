"""
transformer_text_generator.py
==============================
A production-grade, decoder-only Transformer (GPT-style) for text generation.
Pure PyTorch implementation — no external ML libraries required.

Architecture: Decoder-Only Transformer (like GPT-2)
  - Character-level tokenizer with special tokens
  - Sinusoidal + learned positional embeddings
  - Multi-Head Causal Self-Attention (Pre-LN)
  - Feed-Forward Network with GELU activation
  - Autoregressive generation with Temperature / Top-k / Top-p / Repetition Penalty

Author: AI Engine Team
"""

import math
import time
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class TransformerConfig:
    """
    Central configuration for the Transformer model and training pipeline.

    All hyper-parameters live here so that no magic numbers appear in code.
    Tune these to trade off model capacity vs. compute budget.
    """
    vocab_size: int = 256          # Size of the vocabulary (character-level: 256 ASCII)
    d_model: int = 256             # Embedding / hidden dimension
    n_heads: int = 8               # Number of attention heads (must divide d_model)
    n_layers: int = 4              # Number of Transformer decoder blocks
    d_ff: int = 1024               # Inner dimension of the Feed-Forward Network
    max_seq_len: int = 256         # Maximum sequence length (context window)
    dropout: float = 0.1           # Dropout probability (regularization)
    learning_rate: float = 3e-4    # Peak learning rate for AdamW
    batch_size: int = 32           # Training batch size
    num_epochs: int = 30           # Total training epochs
    warmup_steps: int = 100        # Linear warm-up steps before cosine decay
    weight_decay: float = 0.01     # L2 regularization in AdamW
    grad_clip: float = 1.0         # Max gradient norm for clipping
    # Special token ids — populated by Tokenizer
    pad_id: int = 0
    bos_id: int = 1
    eos_id: int = 2
    unk_id: int = 3


# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

class CharTokenizer:
    """
    Character-level tokenizer with four special tokens.

    Mapping strategy
    ----------------
    ids 0-3  → <PAD>, <BOS>, <EOS>, <UNK>
    ids 4+   → printable characters sorted deterministically

    This keeps the vocabulary compact (≤260 entries) while supporting
    arbitrary UTF-8 text via fallback to <UNK>.
    """

    SPECIAL = ["<PAD>", "<BOS>", "<EOS>", "<UNK>"]

    def __init__(self) -> None:
        self.char2id: Dict[str, int] = {}
        self.id2char: Dict[int, str] = {}
        for i, tok in enumerate(self.SPECIAL):
            self.char2id[tok] = i
            self.id2char[i] = tok

    def build(self, text: str) -> None:
        """Build vocabulary from raw text corpus."""
        unique_chars = sorted(set(text))
        offset = len(self.SPECIAL)
        for i, ch in enumerate(unique_chars):
            if ch not in self.char2id:
                idx = i + offset
                self.char2id[ch] = idx
                self.id2char[idx] = ch
        log.info("Vocabulary built: %d tokens", len(self.char2id))

    @property
    def vocab_size(self) -> int:
        return len(self.char2id)

    def encode(self, text: str, add_bos: bool = False, add_eos: bool = False) -> List[int]:
        """Encode a string to a list of integer token ids."""
        ids: List[int] = []
        if add_bos:
            ids.append(self.char2id["<BOS>"])
        for ch in text:
            ids.append(self.char2id.get(ch, self.char2id["<UNK>"]))
        if add_eos:
            ids.append(self.char2id["<EOS>"])
        return ids

    def decode(self, ids: List[int], skip_special: bool = True) -> str:
        """Decode a list of token ids back to a string."""
        chars: List[str] = []
        for i in ids:
            tok = self.id2char.get(i, "<UNK>")
            if skip_special and tok in self.SPECIAL:
                continue
            chars.append(tok)
        return "".join(chars)


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class TextDataset(Dataset):
    """
    Sliding-window dataset that converts a token sequence into
    (input, target) pairs of length `seq_len`.

    For causal LM training:
      input  = tokens[i   : i + seq_len]
      target = tokens[i+1 : i + seq_len + 1]

    Each target token is the next token the model must predict.
    """

    def __init__(self, token_ids: List[int], seq_len: int) -> None:
        self.data = torch.tensor(token_ids, dtype=torch.long)
        self.seq_len = seq_len

    def __len__(self) -> int:
        return max(0, len(self.data) - self.seq_len)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        chunk = self.data[idx : idx + self.seq_len + 1]
        return chunk[:-1], chunk[1:]


# ---------------------------------------------------------------------------
# Positional Encoding (sinusoidal, fixed)
# ---------------------------------------------------------------------------

class SinusoidalPositionalEncoding(nn.Module):
    """
    Fixed sinusoidal positional encoding as described in
    "Attention Is All You Need" (Vaswani et al., 2017).

    PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
    PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))

    The encoding is added (not concatenated) to the token embeddings.
    Buffer is registered so it moves with .to(device) automatically.
    """

    def __init__(self, d_model: int, max_seq_len: int, dropout: float) -> None:
        super().__init__()
        self.dropout = nn.Dropout(dropout)

        pe = torch.zeros(max_seq_len, d_model)                       # (T, D)
        position = torch.arange(max_seq_len, dtype=torch.float).unsqueeze(1)  # (T, 1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float)
            * (-math.log(10000.0) / d_model)
        )  # (D/2,)
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)  # (1, T, D) — batch dimension for broadcasting
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Add positional signal to token embeddings x of shape (B, T, D)."""
        x = x + self.pe[:, : x.size(1)]  # type: ignore[index]
        return self.dropout(x)


# ---------------------------------------------------------------------------
# Scaled Dot-Product Attention
# ---------------------------------------------------------------------------

def scaled_dot_product_attention(
    q: torch.Tensor,
    k: torch.Tensor,
    v: torch.Tensor,
    mask: Optional[torch.Tensor] = None,
    dropout: Optional[nn.Dropout] = None,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Scaled Dot-Product Attention (Vaswani et al., 2017).

    Attention(Q, K, V) = softmax(Q K^T / sqrt(d_k)) V

    Parameters
    ----------
    q, k, v : (B, H, T, d_k)  — queries, keys, values
    mask    : (1, 1, T, T)    — additive mask; -inf blocks future positions
    dropout : optional dropout applied to attention weights

    Returns
    -------
    out     : (B, H, T, d_k)  — weighted values
    weights : (B, H, T, T)    — attention probabilities (for visualization)
    """
    d_k = q.size(-1)
    # (B, H, T, T)
    scores = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(d_k)

    if mask is not None:
        scores = scores + mask  # additive mask: -inf → 0 after softmax

    weights = F.softmax(scores, dim=-1)

    if dropout is not None:
        weights = dropout(weights)

    out = torch.matmul(weights, v)
    return out, weights


# ---------------------------------------------------------------------------
# Multi-Head Self-Attention
# ---------------------------------------------------------------------------

class MultiHeadAttention(nn.Module):
    """
    Multi-Head Self-Attention with causal (autoregressive) masking.

    Splits d_model into H independent heads of dimension d_k = d_model / H,
    runs parallel attention, then projects back to d_model.

    Pre-computed causal mask is stored as a buffer so it is never re-allocated
    during the forward pass — important for throughput at scale.
    """

    def __init__(self, d_model: int, n_heads: int, dropout: float, max_seq_len: int) -> None:
        super().__init__()
        assert d_model % n_heads == 0, "d_model must be divisible by n_heads"

        self.d_model = d_model
        self.n_heads = n_heads
        self.d_k = d_model // n_heads

        # Fused QKV projection for efficiency (single matmul)
        self.qkv_proj = nn.Linear(d_model, 3 * d_model, bias=False)
        self.out_proj = nn.Linear(d_model, d_model, bias=False)
        self.attn_dropout = nn.Dropout(dropout)
        self.resid_dropout = nn.Dropout(dropout)

        # Causal mask: upper triangle = -inf, lower triangle + diagonal = 0
        causal_mask = torch.triu(
            torch.full((max_seq_len, max_seq_len), float("-inf")), diagonal=1
        )
        # Shape (1, 1, T, T) for broadcasting over [batch, heads]
        self.register_buffer("causal_mask", causal_mask.unsqueeze(0).unsqueeze(0))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Parameters
        ----------
        x : (B, T, D)

        Returns
        -------
        out : (B, T, D)
        """
        B, T, D = x.shape

        # Project and split into Q, K, V — shape each: (B, T, D)
        qkv = self.qkv_proj(x)
        q, k, v = qkv.split(self.d_model, dim=-1)

        # Reshape to (B, H, T, d_k) for multi-head attention
        def split_heads(t: torch.Tensor) -> torch.Tensor:
            return t.view(B, T, self.n_heads, self.d_k).transpose(1, 2)

        q, k, v = split_heads(q), split_heads(k), split_heads(v)

        # Slice causal mask to current sequence length
        mask = self.causal_mask[:, :, :T, :T]  # type: ignore[index]

        # Attention: (B, H, T, d_k)
        attn_out, _ = scaled_dot_product_attention(q, k, v, mask, self.attn_dropout)

        # Merge heads: (B, T, D)
        attn_out = attn_out.transpose(1, 2).contiguous().view(B, T, D)

        return self.resid_dropout(self.out_proj(attn_out))


# ---------------------------------------------------------------------------
# Feed-Forward Network
# ---------------------------------------------------------------------------

class FeedForward(nn.Module):
    """
    Position-wise Feed-Forward Network.

    FFN(x) = GELU(x W_1 + b_1) W_2 + b_2

    GELU (Gaussian Error Linear Unit) is used instead of ReLU following
    GPT-2 / BERT conventions; it has smoother gradients and empirically
    trains faster on language tasks.
    """

    def __init__(self, d_model: int, d_ff: int, dropout: float) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_ff, d_model),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


# ---------------------------------------------------------------------------
# Transformer Block (Pre-LN)
# ---------------------------------------------------------------------------

class TransformerBlock(nn.Module):
    """
    Single Transformer decoder block using Pre-LayerNorm (Pre-LN) architecture.

    Pre-LN normalizes inputs BEFORE the sub-layer, which stabilizes training
    and removes the need for learning rate warmup tuning (compared to Post-LN).

    x → LN → MHA → + → LN → FFN → +
    |_________________↑  |__________↑   (residual connections)
    """

    def __init__(self, config: TransformerConfig) -> None:
        super().__init__()
        self.ln1 = nn.LayerNorm(config.d_model)
        self.attn = MultiHeadAttention(
            config.d_model, config.n_heads, config.dropout, config.max_seq_len
        )
        self.ln2 = nn.LayerNorm(config.d_model)
        self.ffn = FeedForward(config.d_model, config.d_ff, config.dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Pre-LN self-attention with residual
        x = x + self.attn(self.ln1(x))
        # Pre-LN feed-forward with residual
        x = x + self.ffn(self.ln2(x))
        return x


# ---------------------------------------------------------------------------
# GPT-style Decoder-Only Transformer
# ---------------------------------------------------------------------------

class GPTLanguageModel(nn.Module):
    """
    Decoder-only Transformer language model (GPT architecture).

    Components
    ----------
    token_emb : learnable token embedding table (vocab_size × d_model)
    pos_enc   : sinusoidal positional encoding (fixed, not learned)
    blocks    : stack of N TransformerBlock layers
    ln_final  : final LayerNorm before the output projection
    lm_head   : linear projection from d_model → vocab_size (no bias, tied weights)

    Weight Tying
    ------------
    The output projection (lm_head) shares weights with token_emb following
    Press & Wolf (2017). This reduces parameters and improves perplexity.
    """

    def __init__(self, config: TransformerConfig) -> None:
        super().__init__()
        self.config = config

        self.token_emb = nn.Embedding(config.vocab_size, config.d_model)
        self.pos_enc = SinusoidalPositionalEncoding(
            config.d_model, config.max_seq_len, config.dropout
        )
        self.blocks = nn.Sequential(*[TransformerBlock(config) for _ in range(config.n_layers)])
        self.ln_final = nn.LayerNorm(config.d_model)
        self.lm_head = nn.Linear(config.d_model, config.vocab_size, bias=False)

        # Weight tying: share embedding and output projection weights
        self.lm_head.weight = self.token_emb.weight

        # Parameter initialization following GPT-2 paper
        self.apply(self._init_weights)
        # Scale residual projections by 1/sqrt(2*N) for depth stability
        for name, p in self.named_parameters():
            if name.endswith("out_proj.weight") or name.endswith("net.3.weight"):
                nn.init.normal_(p, mean=0.0, std=0.02 / math.sqrt(2 * config.n_layers))

        log.info(
            "Model initialized: %d parameters",
            sum(p.numel() for p in self.parameters() if p.requires_grad),
        )

    @staticmethod
    def _init_weights(module: nn.Module) -> None:
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(
        self, idx: torch.Tensor, targets: Optional[torch.Tensor] = None
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        """
        Parameters
        ----------
        idx     : (B, T) long tensor of input token ids
        targets : (B, T) long tensor of target token ids (for training)

        Returns
        -------
        logits : (B, T, vocab_size)
        loss   : scalar cross-entropy loss if targets provided, else None
        """
        x = self.token_emb(idx)          # (B, T, D)
        x = self.pos_enc(x)              # add positional signal
        x = self.blocks(x)               # N transformer blocks
        x = self.ln_final(x)             # final layer norm
        logits = self.lm_head(x)         # (B, T, V)

        loss = None
        if targets is not None:
            # Flatten to (B*T, V) and (B*T,) for cross-entropy
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),
                targets.view(-1),
                ignore_index=0,  # ignore <PAD> tokens
            )

        return logits, loss


# ---------------------------------------------------------------------------
# Text Generation (Inference)
# ---------------------------------------------------------------------------

class TextGenerator:
    """
    Autoregressive text generation with multiple decoding strategies.

    All strategies share the core loop:
      1. Feed current context through model
      2. Extract logits for the LAST position
      3. Apply sampling strategy to select next token
      4. Append token and repeat until max_new_tokens or <EOS>

    Strategies
    ----------
    greedy      : always pick argmax(logits)
    temperature : divide logits by T before softmax (T<1 → sharper, T>1 → flatter)
    top-k       : keep only top-k logits, zero out the rest
    top-p       : keep smallest set of tokens summing to probability ≥ p (nucleus)
    rep_penalty : divide logit of already-generated tokens by penalty factor
    """

    def __init__(self, model: GPTLanguageModel, tokenizer: CharTokenizer, device: torch.device) -> None:
        self.model = model
        self.tokenizer = tokenizer
        self.device = device

    @torch.no_grad()
    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 200,
        temperature: float = 1.0,
        top_k: Optional[int] = None,
        top_p: Optional[float] = None,
        repetition_penalty: float = 1.0,
    ) -> str:
        """
        Generate text autoregressively from a text prompt.

        Parameters
        ----------
        prompt            : seed text string
        max_new_tokens    : maximum tokens to generate
        temperature       : sampling temperature (0 → greedy)
        top_k             : if set, restrict to top-k logits
        top_p             : if set, nucleus sampling threshold
        repetition_penalty: > 1.0 penalizes repeated tokens

        Returns
        -------
        Generated text string (prompt + continuation).
        """
        self.model.eval()
        config = self.model.config

        # Encode prompt
        ids = self.tokenizer.encode(prompt, add_bos=True)
        input_ids = torch.tensor([ids], dtype=torch.long, device=self.device)

        generated_ids: List[int] = list(ids)

        for _ in range(max_new_tokens):
            # Truncate to max_seq_len context window
            ctx = input_ids[:, -config.max_seq_len:]

            logits, _ = self.model(ctx)
            # Focus on last position: (1, vocab_size)
            next_logits = logits[:, -1, :]

            # --- Repetition penalty ---
            if repetition_penalty != 1.0:
                for token_id in set(generated_ids):
                    if next_logits[0, token_id] < 0:
                        next_logits[0, token_id] *= repetition_penalty
                    else:
                        next_logits[0, token_id] /= repetition_penalty

            # --- Greedy decoding ---
            if temperature == 0.0:
                next_id = int(torch.argmax(next_logits, dim=-1).item())
            else:
                # --- Temperature scaling ---
                next_logits = next_logits / temperature

                # --- Top-k filtering ---
                if top_k is not None and top_k > 0:
                    k = min(top_k, next_logits.size(-1))
                    topk_vals, _ = torch.topk(next_logits, k)
                    threshold = topk_vals[:, -1].unsqueeze(-1)
                    next_logits = next_logits.masked_fill(next_logits < threshold, float("-inf"))

                # --- Top-p (nucleus) filtering ---
                if top_p is not None and 0.0 < top_p < 1.0:
                    sorted_logits, sorted_indices = torch.sort(next_logits, descending=True)
                    cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
                    # Remove tokens where cumulative prob exceeds top_p
                    sorted_remove = cumulative_probs - F.softmax(sorted_logits, dim=-1) > top_p
                    sorted_logits[sorted_remove] = float("-inf")
                    # Scatter back to original ordering
                    next_logits = torch.zeros_like(next_logits).scatter_(
                        1, sorted_indices, sorted_logits
                    )

                probs = F.softmax(next_logits, dim=-1)
                next_id = int(torch.multinomial(probs, num_samples=1).item())

            generated_ids.append(next_id)
            input_ids = torch.cat(
                [input_ids, torch.tensor([[next_id]], device=self.device)], dim=1
            )

            # Stop at EOS
            if next_id == self.tokenizer.char2id["<EOS>"]:
                break

        return self.tokenizer.decode(generated_ids)


# ---------------------------------------------------------------------------
# Learning Rate Scheduler: Linear Warmup + Cosine Annealing
# ---------------------------------------------------------------------------

def get_lr_scheduler(
    optimizer: torch.optim.Optimizer,
    warmup_steps: int,
    total_steps: int,
) -> torch.optim.lr_scheduler.LambdaLR:
    """
    Linear warm-up for `warmup_steps` steps, then cosine annealing to 0.

    This schedule is standard for Transformer LM training:
    - Warmup prevents large gradient updates at initialization
    - Cosine decay provides smooth convergence without manual step scheduling

    lr(t) = lr_peak * min(t/warmup, 0.5*(1 + cos(π*(t-warmup)/(total-warmup))))
    """
    def lr_lambda(step: int) -> float:
        if step < warmup_steps:
            return float(step) / max(1, warmup_steps)
        progress = float(step - warmup_steps) / max(1, total_steps - warmup_steps)
        return max(0.0, 0.5 * (1.0 + math.cos(math.pi * progress)))

    return torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)


# ---------------------------------------------------------------------------
# Training Pipeline
# ---------------------------------------------------------------------------

def train(
    model: GPTLanguageModel,
    dataloader: DataLoader,
    config: TransformerConfig,
    device: torch.device,
) -> None:
    """
    Full training loop with:
    - AdamW optimizer (separate weight decay from adaptive moments)
    - Cosine LR schedule with linear warmup
    - Gradient clipping (prevent exploding gradients)
    - Per-epoch loss logging

    No weight decay is applied to bias terms or LayerNorm parameters
    (following GPT-2 best practices) to avoid under-regularizing small tensors.
    """
    # Split parameters: no decay for 1-D params (biases, LN weight/bias)
    decay_params = [p for n, p in model.named_parameters() if p.dim() >= 2]
    no_decay_params = [p for n, p in model.named_parameters() if p.dim() < 2]

    optimizer = torch.optim.AdamW(
        [
            {"params": decay_params,    "weight_decay": config.weight_decay},
            {"params": no_decay_params, "weight_decay": 0.0},
        ],
        lr=config.learning_rate,
        betas=(0.9, 0.95),
        eps=1e-8,
    )

    total_steps = config.num_epochs * len(dataloader)
    scheduler = get_lr_scheduler(optimizer, config.warmup_steps, total_steps)

    model.train()
    global_step = 0

    for epoch in range(1, config.num_epochs + 1):
        epoch_loss = 0.0
        t0 = time.time()

        for x, y in dataloader:
            x, y = x.to(device), y.to(device)

            optimizer.zero_grad(set_to_none=True)
            _, loss = model(x, y)

            loss.backward()

            # Gradient clipping — prevents gradient explosion in deep networks
            nn.utils.clip_grad_norm_(model.parameters(), config.grad_clip)

            optimizer.step()
            scheduler.step()
            global_step += 1
            epoch_loss += loss.item()

        avg_loss = epoch_loss / max(1, len(dataloader))
        elapsed = time.time() - t0
        current_lr = scheduler.get_last_lr()[0]
        log.info(
            "Epoch %3d/%d | loss=%.4f | lr=%.2e | %.1fs",
            epoch, config.num_epochs, avg_loss, current_lr, elapsed,
        )


# ---------------------------------------------------------------------------
# Built-in Training Corpus
# ---------------------------------------------------------------------------

TRAINING_TEXT = """
The universe is vast and filled with wonder. Stars are born from clouds of gas and dust,
ignite through nuclear fusion, and live for millions or billions of years before dying
in spectacular supernovae that seed the cosmos with heavy elements.

Artificial intelligence represents one of humanity's most ambitious endeavors.
Machine learning models learn patterns from data, enabling computers to recognize
images, translate languages, generate music, and engage in complex reasoning tasks
that once seemed uniquely human.

Deep learning, a subset of machine learning, uses neural networks with many layers
to learn hierarchical representations of data. Each layer extracts increasingly
abstract features: early layers detect edges and textures, while deeper layers
recognize objects, faces, and complex semantic concepts.

The transformer architecture revolutionized natural language processing. By relying
entirely on attention mechanisms rather than recurrence, transformers can process
sequences in parallel and capture long-range dependencies far more effectively
than their predecessors.

Language models trained on vast corpora of text develop an implicit understanding
of grammar, facts, reasoning patterns, and even creative writing styles. They
predict the next token given a context window, yet this simple objective produces
remarkably capable systems.

Mathematics is the language of the universe. From the elegant simplicity of Euler's
identity to the complex dynamics of chaotic systems, mathematical structures
describe physical reality with uncanny precision. Number theory, topology, and
abstract algebra find unexpected applications in cryptography, physics, and
computer science.

The history of civilization is a story of accumulated knowledge. Libraries, printing
presses, and the internet each accelerated the transmission of ideas across space
and time. Today, a curious mind with an internet connection has access to more
information than the greatest scholars of previous centuries could imagine.

Consciousness remains one of the deepest mysteries in science and philosophy.
The subjective experience of seeing red, feeling joy, or contemplating existence
cannot be easily reduced to physical processes, yet all evidence suggests it
emerges from the brain's billions of interconnected neurons.

Quantum mechanics governs behavior at the atomic scale. Particles exist in
superpositions of states, entanglement links distant particles instantaneously,
and measurement itself changes the system being observed. These counterintuitive
phenomena have been confirmed by countless experiments and underlie technologies
from lasers to transistors.

Evolution by natural selection is the unifying theory of biology. Random mutations
in DNA, filtered by environmental pressures over generations, produced the
staggering diversity of life on Earth, from bacteria to blue whales, from oak
trees to the neurons firing in your brain as you read these words.
""".strip()


# ---------------------------------------------------------------------------
# Main Entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    """
    End-to-end demonstration:
      1. Build vocabulary from corpus
      2. Create dataset and dataloader
      3. Instantiate model
      4. Train for num_epochs
      5. Generate text with multiple decoding strategies
    """
    # ── Device selection ──────────────────────────────────────────────────
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log.info("Using device: %s", device)

    # ── Tokenizer ────────────────────────────────────────────────────────
    tokenizer = CharTokenizer()
    tokenizer.build(TRAINING_TEXT)

    # ── Configuration ────────────────────────────────────────────────────
    config = TransformerConfig(
        vocab_size=tokenizer.vocab_size,
        d_model=256,
        n_heads=8,
        n_layers=4,
        d_ff=1024,
        max_seq_len=128,
        dropout=0.1,
        learning_rate=3e-4,
        batch_size=32,
        num_epochs=30,
        warmup_steps=100,
        weight_decay=0.01,
        grad_clip=1.0,
    )
    config.pad_id = tokenizer.char2id["<PAD>"]
    config.bos_id = tokenizer.char2id["<BOS>"]
    config.eos_id = tokenizer.char2id["<EOS>"]
    config.unk_id = tokenizer.char2id["<UNK>"]

    # ── Dataset & DataLoader ──────────────────────────────────────────────
    token_ids = tokenizer.encode(TRAINING_TEXT)
    dataset = TextDataset(token_ids, seq_len=config.max_seq_len)
    dataloader: DataLoader = DataLoader(
        dataset,
        batch_size=config.batch_size,
        shuffle=True,
        drop_last=True,
        num_workers=0,  # set >0 on Linux for multiprocessing speedup
    )
    log.info("Dataset: %d samples, %d tokens", len(dataset), len(token_ids))

    # ── Model ─────────────────────────────────────────────────────────────
    model = GPTLanguageModel(config).to(device)

    # ── Training ──────────────────────────────────────────────────────────
    log.info("Starting training …")
    train(model, dataloader, config, device)
    log.info("Training complete.")

    # ── Generation ────────────────────────────────────────────────────────
    generator = TextGenerator(model, tokenizer, device)
    prompt = "The universe is"

    print("\n" + "=" * 70)
    print("TEXT GENERATION DEMO")
    print("=" * 70)

    # Strategy 1: Temperature sampling — balanced creativity
    print(f"\n[Strategy 1] temperature=0.7, top_k=50")
    print("-" * 60)
    result1 = generator.generate(
        prompt,
        max_new_tokens=200,
        temperature=0.7,
        top_k=50,
    )
    print(result1)

    # Strategy 2: Nucleus (top-p) sampling — diverse but coherent
    print(f"\n[Strategy 2] temperature=1.0, top_p=0.9, repetition_penalty=1.2")
    print("-" * 60)
    result2 = generator.generate(
        prompt,
        max_new_tokens=200,
        temperature=1.0,
        top_p=0.9,
        repetition_penalty=1.2,
    )
    print(result2)

    # Strategy 3: Greedy decoding — deterministic, highest probability path
    print(f"\n[Strategy 3] greedy (temperature=0)")
    print("-" * 60)
    result3 = generator.generate(
        prompt,
        max_new_tokens=200,
        temperature=0.0,
    )
    print(result3)

    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()
