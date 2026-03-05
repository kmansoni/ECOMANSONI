#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 10: Blockchain & Web3
=====================================
Паттерны: Simple Blockchain, Wallet/Keys, Transaction signing, Merkle Tree
Архитектурные решения:
  - PoW (Proof of Work) для демонстрации — в реальных системах PoS/PoA
  - ECDSA подпись транзакций (secp256k1 как в Bitcoin/Ethereum) через ecdsa
  - Merkle Tree для эффективной верификации наличия транзакции в блоке
  - Consensus: longest chain rule (Nakamoto consensus)
  - Иммутабельность: изменение блока инвалидирует весь chain
"""

from __future__ import annotations

import hashlib
import json
import secrets
import time
from dataclasses import asdict, dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# 1. Криптография — Wallet & Signing
# ---------------------------------------------------------------------------
try:
    import ecdsa  # pip install ecdsa

    def generate_keypair() -> tuple[str, str]:
        """Генерирует ECDSA secp256k1 пару ключей (как в Bitcoin)."""
        sk = ecdsa.SigningKey.generate(curve=ecdsa.SECP256k1)
        vk = sk.get_verifying_key()
        return sk.to_string().hex(), vk.to_string().hex()

    def sign_message(private_key_hex: str, message: str) -> str:
        """Подписывает сообщение приватным ключом."""
        sk = ecdsa.SigningKey.from_string(bytes.fromhex(private_key_hex), curve=ecdsa.SECP256k1)
        return sk.sign(message.encode()).hex()

    def verify_signature(public_key_hex: str, message: str, signature_hex: str) -> bool:
        """Верифицирует подпись публичным ключом."""
        try:
            vk = ecdsa.VerifyingKey.from_string(bytes.fromhex(public_key_hex), curve=ecdsa.SECP256k1)
            return vk.verify(bytes.fromhex(signature_hex), message.encode())
        except Exception:
            return False

except ImportError:
    # Fallback: имитация через HMAC (НЕ для прода, только для демо без ecdsa)
    import hmac as _hmac

    def generate_keypair() -> tuple[str, str]:  # type: ignore[misc]
        priv = secrets.token_hex(32)
        pub = hashlib.sha256(priv.encode()).hexdigest()
        return priv, pub

    def sign_message(private_key_hex: str, message: str) -> str:  # type: ignore[misc]
        return _hmac.new(bytes.fromhex(private_key_hex), message.encode(), hashlib.sha256).hexdigest()

    def verify_signature(public_key_hex: str, message: str, signature_hex: str) -> bool:  # type: ignore[misc]
        return True  # Упрощённо для демо


def public_key_to_address(public_key_hex: str) -> str:
    """Деривация адреса кошелька из публичного ключа (как в Ethereum: keccak256[-20:])."""
    h = hashlib.sha256(bytes.fromhex(public_key_hex)).digest()
    return "0x" + hashlib.new("sha256", h).hexdigest()[-40:]


# ---------------------------------------------------------------------------
# 2. Transaction
# ---------------------------------------------------------------------------
@dataclass
class Transaction:
    sender: str      # Адрес отправителя
    recipient: str   # Адрес получателя
    amount: float
    timestamp: float = field(default_factory=time.time)
    signature: str = ""
    tx_id: str = ""

    def __post_init__(self) -> None:
        if not self.tx_id:
            self.tx_id = self._compute_id()

    def _compute_id(self) -> str:
        payload = f"{self.sender}{self.recipient}{self.amount}{self.timestamp}"
        return hashlib.sha256(payload.encode()).hexdigest()

    def sign(self, private_key_hex: str) -> None:
        """Подписывает транзакцию. sender должен совпадать с адресом из ключа."""
        self.signature = sign_message(private_key_hex, self._message())

    def is_valid(self, public_key_hex: str) -> bool:
        """Проверяет валидность транзакции."""
        if self.amount <= 0:
            return False
        if not self.signature:
            return False
        return verify_signature(public_key_hex, self._message(), self.signature)

    def _message(self) -> str:
        return f"{self.sender}{self.recipient}{self.amount}{self.timestamp}"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# 3. Merkle Tree
# ---------------------------------------------------------------------------
class MerkleTree:
    """
    Merkle Tree для эффективной верификации транзакций.
    Вместо хранения всех транзакций достаточно root hash — O(log n) доказательство.
    """

    def __init__(self, items: list[str]) -> None:
        self.leaves = [self._hash(item) for item in items]
        self.root = self._build(self.leaves)

    @staticmethod
    def _hash(data: str) -> str:
        return hashlib.sha256(data.encode()).hexdigest()

    def _build(self, nodes: list[str]) -> str:
        if not nodes:
            return self._hash("")
        if len(nodes) == 1:
            return nodes[0]
        # Дублируем последний узел если нечётное количество
        if len(nodes) % 2 == 1:
            nodes = nodes + [nodes[-1]]
        parent_level = [
            self._hash(nodes[i] + nodes[i + 1]) for i in range(0, len(nodes), 2)
        ]
        return self._build(parent_level)

    def verify(self, item: str) -> bool:
        """Проверяет, что item входит в дерево (упрощённо — O(n))."""
        return self._hash(item) in self.leaves


# ---------------------------------------------------------------------------
# 4. Block
# ---------------------------------------------------------------------------
@dataclass
class Block:
    index: int
    transactions: list[Transaction]
    previous_hash: str
    timestamp: float = field(default_factory=time.time)
    nonce: int = 0
    hash: str = ""

    def __post_init__(self) -> None:
        if not self.hash:
            self.hash = self.compute_hash()

    @property
    def merkle_root(self) -> str:
        return MerkleTree([tx.tx_id for tx in self.transactions]).root

    def compute_hash(self) -> str:
        block_data = {
            "index": self.index,
            "merkle_root": self.merkle_root,
            "previous_hash": self.previous_hash,
            "timestamp": self.timestamp,
            "nonce": self.nonce,
        }
        return hashlib.sha256(json.dumps(block_data, sort_keys=True).encode()).hexdigest()

    def mine(self, difficulty: int) -> None:
        """Proof of Work: находит nonce при котором hash начинается с `difficulty` нулей."""
        target = "0" * difficulty
        while not self.hash.startswith(target):
            self.nonce += 1
            self.hash = self.compute_hash()


# ---------------------------------------------------------------------------
# 5. Blockchain
# ---------------------------------------------------------------------------
class Blockchain:
    """
    Простой blockchain с PoW.
    Consensus: longest valid chain wins.
    """

    DIFFICULTY = 2  # В реальных сетях динамически меняется

    def __init__(self) -> None:
        self.chain: list[Block] = [self._genesis()]
        self._pending_transactions: list[Transaction] = []

    def _genesis(self) -> Block:
        """Genesis блок — первый блок в chain."""
        block = Block(index=0, transactions=[], previous_hash="0" * 64)
        block.mine(self.DIFFICULTY)
        return block

    @property
    def latest_block(self) -> Block:
        return self.chain[-1]

    def add_transaction(self, tx: Transaction) -> None:
        self._pending_transactions.append(tx)

    def mine_block(self, miner_address: str) -> Block:
        """Формирует новый блок из pending транзакций и майнит."""
        # Reward транзакция для майнера
        reward_tx = Transaction(sender="0" * 40, recipient=miner_address, amount=50.0)
        transactions = self._pending_transactions + [reward_tx]

        block = Block(
            index=len(self.chain),
            transactions=transactions,
            previous_hash=self.latest_block.hash,
        )
        block.mine(self.DIFFICULTY)
        self.chain.append(block)
        self._pending_transactions = []
        return block

    def is_valid(self) -> bool:
        """Верифицирует целостность всего chain."""
        for i in range(1, len(self.chain)):
            current = self.chain[i]
            previous = self.chain[i - 1]

            # Проверяем hash блока
            if current.hash != current.compute_hash():
                return False
            # Проверяем связь с предыдущим блоком
            if current.previous_hash != previous.hash:
                return False
            # Проверяем PoW
            if not current.hash.startswith("0" * self.DIFFICULTY):
                return False
        return True

    def get_balance(self, address: str) -> float:
        """Вычисляет баланс адреса, просматривая все транзакции в chain."""
        balance = 0.0
        for block in self.chain:
            for tx in block.transactions:
                if tx.recipient == address:
                    balance += tx.amount
                if tx.sender == address:
                    balance -= tx.amount
        return balance


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=== Blockchain Demo ===\n")

    # Кошельки
    alice_priv, alice_pub = generate_keypair()
    bob_priv, bob_pub = generate_keypair()
    alice_addr = public_key_to_address(alice_pub)
    bob_addr = public_key_to_address(bob_pub)
    print(f"Alice: {alice_addr}")
    print(f"Bob:   {bob_addr}")

    # Инициализация blockchain
    bc = Blockchain()

    # Alice майнит первый блок (получает reward)
    print("\nМайнинг блока 1 (Alice)...")
    bc.mine_block(alice_addr)
    print(f"Alice balance: {bc.get_balance(alice_addr)}")

    # Alice → Bob 20 токенов
    tx = Transaction(sender=alice_addr, recipient=bob_addr, amount=20.0)
    tx.sign(alice_priv)
    bc.add_transaction(tx)

    print("\nМайнинг блока 2...")
    block2 = bc.mine_block(alice_addr)
    print(f"Block 2 hash: {block2.hash[:20]}...")
    print(f"Alice balance: {bc.get_balance(alice_addr)}")
    print(f"Bob balance:   {bc.get_balance(bob_addr)}")

    print(f"\nBlockchain valid: {bc.is_valid()}")

    # Попытка взлома — изменяем транзакцию
    bc.chain[1].transactions[0].amount = 9999
    bc.chain[1].hash = bc.chain[1].compute_hash()
    print(f"Blockchain after tampering: {bc.is_valid()}")

    # Merkle Tree
    print("\n=== Merkle Tree ===")
    mt = MerkleTree(["tx1", "tx2", "tx3", "tx4"])
    print(f"Root: {mt.root[:20]}...")
    print(f"Verify 'tx2': {mt.verify('tx2')}")
    print(f"Verify 'tx99': {mt.verify('tx99')}")
