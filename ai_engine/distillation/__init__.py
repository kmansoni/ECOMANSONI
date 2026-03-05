"""ARIA Distillation Module — self-distillation и компрессия модели."""
from .self_distill import SelfDistiller, DistillationConfig, DistillationResult

__all__ = ["SelfDistiller", "DistillationConfig", "DistillationResult"]
