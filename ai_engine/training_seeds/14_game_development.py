#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 14: Game Development Patterns
=============================================
Паттерны: Game Loop, ECS (Entity Component System), Collision Detection, State Machine
Архитектурные решения:
  - ECS разделяет данные (Components) и логику (Systems) — лучше cache locality
  - Game Loop с фиксированным timestep (fixed dt) для deterministic physics
  - AABB collision detection — O(n²) для малого N, Spatial Hash Grid для большого N
  - State Machine для game states — чёткие переходы, нет спагетти-логики
  - Event system для слабосвязанного общения между системами
"""

from __future__ import annotations

import time
import uuid
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Callable, Generator, TypeVar

# ---------------------------------------------------------------------------
# 1. Entity Component System (ECS)
# ---------------------------------------------------------------------------
EntityId = str


def create_entity() -> EntityId:
    return str(uuid.uuid4())[:8]


# Компоненты — чистые данные, без логики
@dataclass
class Position:
    x: float = 0.0
    y: float = 0.0


@dataclass
class Velocity:
    vx: float = 0.0
    vy: float = 0.0


@dataclass
class Collider:
    width: float = 32.0
    height: float = 32.0


@dataclass
class Health:
    current: int = 100
    maximum: int = 100

    @property
    def is_alive(self) -> bool:
        return self.current > 0

    def take_damage(self, amount: int) -> None:
        self.current = max(0, self.current - amount)


@dataclass
class Sprite:
    texture_id: str = "default"
    scale: float = 1.0
    visible: bool = True


class World:
    """
    ECS World — хранилище всех сущностей и компонентов.
    Компоненты хранятся в typed dictionaries для быстрого доступа
    и cache-friendly iteration по каждому типу компонента.
    """

    def __init__(self) -> None:
        self._entities: set[EntityId] = set()
        # {ComponentType: {EntityId: Component}}
        self._components: dict[type, dict[EntityId, Any]] = defaultdict(dict)
        self._to_destroy: list[EntityId] = []

    def create_entity(self) -> EntityId:
        eid = create_entity()
        self._entities.add(eid)
        return eid

    def destroy_entity(self, eid: EntityId) -> None:
        """Отложенное удаление — во время итерации не удаляем."""
        self._to_destroy.append(eid)

    def _flush_destroyed(self) -> None:
        for eid in self._to_destroy:
            self._entities.discard(eid)
            for component_dict in self._components.values():
                component_dict.pop(eid, None)
        self._to_destroy.clear()

    def add_component(self, eid: EntityId, component: Any) -> None:
        self._components[type(component)][eid] = component

    def get_component(self, eid: EntityId, component_type: type) -> Any | None:
        return self._components[component_type].get(eid)

    def has_component(self, eid: EntityId, component_type: type) -> bool:
        return eid in self._components[component_type]

    def query(self, *component_types: type) -> Generator[tuple[EntityId, ...], None, None]:
        """Возвращает entity + компоненты для entity у которых есть все нужные типы."""
        if not component_types:
            return
        primary = min(component_types, key=lambda ct: len(self._components.get(ct, {})))
        for eid in list(self._components[primary]):
            if all(eid in self._components[ct] for ct in component_types):
                yield (eid, *[self._components[ct][eid] for ct in component_types])


# ---------------------------------------------------------------------------
# 2. Systems — логика над компонентами
# ---------------------------------------------------------------------------
class System(ABC):
    """Базовый класс системы ECS."""

    @abstractmethod
    def update(self, world: World, dt: float) -> None: ...


class MovementSystem(System):
    """Обновляет позиции на основе скоростей. Euler integration."""

    def update(self, world: World, dt: float) -> None:
        for eid, pos, vel in world.query(Position, Velocity):
            pos.x += vel.vx * dt
            pos.y += vel.vy * dt


class CollisionSystem(System):
    """
    AABB (Axis-Aligned Bounding Box) коллизии.
    O(n²) — для малых сцен. Для 1000+ объектов: Spatial Hash Grid или BVH.
    """

    def update(self, world: World, dt: float) -> None:
        entities = list(world.query(Position, Collider))
        for i in range(len(entities)):
            for j in range(i + 1, len(entities)):
                eid_a, pos_a, col_a = entities[i]
                eid_b, pos_b, col_b = entities[j]
                if self._aabb_overlap(pos_a, col_a, pos_b, col_b):
                    self._on_collision(world, eid_a, eid_b)

    @staticmethod
    def _aabb_overlap(pos_a: Position, col_a: Collider, pos_b: Position, col_b: Collider) -> bool:
        return (
            abs(pos_a.x - pos_b.x) < (col_a.width + col_b.width) / 2
            and abs(pos_a.y - pos_b.y) < (col_a.height + col_b.height) / 2
        )

    def _on_collision(self, world: World, eid_a: EntityId, eid_b: EntityId) -> None:
        hp_a = world.get_component(eid_a, Health)
        hp_b = world.get_component(eid_b, Health)
        if hp_a:
            hp_a.take_damage(10)
        if hp_b:
            hp_b.take_damage(10)


class LifetimeSystem(System):
    """Удаляет мёртвые сущности."""

    def update(self, world: World, dt: float) -> None:
        for eid, health in world.query(Health):
            if not health.is_alive:
                world.destroy_entity(eid)


# ---------------------------------------------------------------------------
# 3. Event System
# ---------------------------------------------------------------------------
class EventBus:
    """
    Pub/Sub event bus для слабосвязанного общения между системами.
    Синхронный dispatch — в проде может быть async с очередью событий.
    """

    def __init__(self) -> None:
        self._handlers: dict[str, list[Callable[..., None]]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: Callable[..., None]) -> None:
        self._handlers[event_type].append(handler)

    def unsubscribe(self, event_type: str, handler: Callable[..., None]) -> None:
        self._handlers[event_type] = [h for h in self._handlers[event_type] if h != handler]

    def publish(self, event_type: str, **data: Any) -> None:
        for handler in self._handlers[event_type]:
            handler(**data)


# ---------------------------------------------------------------------------
# 4. Game State Machine
# ---------------------------------------------------------------------------
class GameState(Enum):
    MENU = auto()
    LOADING = auto()
    PLAYING = auto()
    PAUSED = auto()
    GAME_OVER = auto()
    VICTORY = auto()


@dataclass
class StateTransition:
    from_state: GameState
    to_state: GameState
    condition: str


VALID_TRANSITIONS: list[StateTransition] = [
    StateTransition(GameState.MENU, GameState.LOADING, "start_game"),
    StateTransition(GameState.LOADING, GameState.PLAYING, "load_complete"),
    StateTransition(GameState.PLAYING, GameState.PAUSED, "pause"),
    StateTransition(GameState.PAUSED, GameState.PLAYING, "resume"),
    StateTransition(GameState.PLAYING, GameState.GAME_OVER, "player_died"),
    StateTransition(GameState.PLAYING, GameState.VICTORY, "level_complete"),
    StateTransition(GameState.GAME_OVER, GameState.MENU, "to_menu"),
    StateTransition(GameState.VICTORY, GameState.MENU, "to_menu"),
]


class GameStateMachine:
    """
    Явная state machine — невозможно совершить невалидный переход.
    Это предотвращает баги "призрачных состояний" в игровой логике.
    """

    def __init__(self) -> None:
        self._state = GameState.MENU
        self._transition_map: dict[tuple[GameState, str], GameState] = {
            (t.from_state, t.condition): t.to_state for t in VALID_TRANSITIONS
        }
        self._enter_handlers: dict[GameState, Callable[[], None]] = {}
        self._exit_handlers: dict[GameState, Callable[[], None]] = {}

    @property
    def state(self) -> GameState:
        return self._state

    def on_enter(self, state: GameState) -> Callable:
        def decorator(fn: Callable) -> Callable:
            self._enter_handlers[state] = fn
            return fn
        return decorator

    def on_exit(self, state: GameState) -> Callable:
        def decorator(fn: Callable) -> Callable:
            self._exit_handlers[state] = fn
            return fn
        return decorator

    def transition(self, condition: str) -> bool:
        """Выполняет переход если он валиден. Возвращает False если переход запрещён."""
        key = (self._state, condition)
        new_state = self._transition_map.get(key)
        if new_state is None:
            return False

        if handler := self._exit_handlers.get(self._state):
            handler()
        old = self._state
        self._state = new_state
        if handler := self._enter_handlers.get(new_state):
            handler()
        print(f"[FSM] {old.name} → {new_state.name} via '{condition}'")
        return True


# ---------------------------------------------------------------------------
# 5. Game Loop с фиксированным timestep
# ---------------------------------------------------------------------------
class GameLoop:
    """
    Fixed timestep game loop.
    Физика обновляется с постоянным dt для determinism.
    Рендер интерполирует между состояниями для плавности.
    """

    def __init__(self, target_fps: int = 60, physics_fps: int = 60) -> None:
        self.target_fps = target_fps
        self._fixed_dt = 1.0 / physics_fps
        self._running = False
        self._world = World()
        self._systems: list[System] = [
            MovementSystem(),
            CollisionSystem(),
            LifetimeSystem(),
        ]

    def setup_scene(self) -> None:
        """Инициализация игровой сцены."""
        player = self._world.create_entity()
        self._world.add_component(player, Position(x=100, y=100))
        self._world.add_component(player, Velocity(vx=50, vy=30))
        self._world.add_component(player, Collider(width=32, height=32))
        self._world.add_component(player, Health(current=100, maximum=100))
        self._world.add_component(player, Sprite(texture_id="player"))

        enemy = self._world.create_entity()
        self._world.add_component(enemy, Position(x=110, y=105))
        self._world.add_component(enemy, Velocity(vx=-20, vy=0))
        self._world.add_component(enemy, Collider(width=32, height=32))
        self._world.add_component(enemy, Health(current=50, maximum=50))

    def run(self, max_frames: int = 10) -> None:
        """Запускает игровой цикл на max_frames итераций (для демо)."""
        self._running = True
        accumulator = 0.0
        last_time = time.monotonic()
        frame = 0

        while self._running and frame < max_frames:
            now = time.monotonic()
            frame_time = min(now - last_time, 0.25)  # cap чтобы избежать spiral of death
            last_time = now
            accumulator += frame_time

            # Fixed timestep physics update
            while accumulator >= self._fixed_dt:
                for system in self._systems:
                    system.update(self._world, self._fixed_dt)
                self._world._flush_destroyed()
                accumulator -= self._fixed_dt

            frame += 1
            time.sleep(1.0 / self.target_fps)

        print(f"[GameLoop] Completed {frame} frames")


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=== ECS Demo ===")
    world = World()
    player = world.create_entity()
    world.add_component(player, Position(50, 50))
    world.add_component(player, Velocity(100, 0))
    world.add_component(player, Health(100, 100))

    enemy = world.create_entity()
    world.add_component(enemy, Position(60, 55))
    world.add_component(enemy, Collider(32, 32))
    world.add_component(enemy, Health(50, 50))
    world.add_component(enemy, Position(60, 55))

    mv = MovementSystem()
    mv.update(world, 0.016)
    pos = world.get_component(player, Position)
    print(f"Player position after 1 frame: ({pos.x:.1f}, {pos.y:.1f})")

    print("\n=== State Machine ===")
    fsm = GameStateMachine()
    print(f"Initial state: {fsm.state.name}")
    fsm.transition("start_game")
    fsm.transition("load_complete")
    fsm.transition("pause")
    result = fsm.transition("player_died")  # Невалидный из PAUSED
    print(f"Invalid transition from PAUSED 'player_died': {result}")
    fsm.transition("resume")
    fsm.transition("player_died")

    print("\n=== Event Bus ===")
    bus = EventBus()
    events: list[str] = []
    bus.subscribe("score", lambda points, player_id: events.append(f"{player_id}+{points}"))
    bus.publish("score", points=100, player_id="player-1")
    bus.publish("score", points=250, player_id="player-1")
    print(f"Events received: {events}")

    print("\n=== Game Loop (5 frames) ===")
    game = GameLoop(target_fps=60)
    game.setup_scene()
    game.run(max_frames=5)
