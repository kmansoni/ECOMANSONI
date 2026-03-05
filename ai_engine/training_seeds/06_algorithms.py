#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 06: Algorithms & Data Structures
===============================================
Покрытие: Sorting, Graph (BFS/DFS/Dijkstra), Dynamic Programming, Binary Search
Каждая функция содержит:
  - Time complexity в docstring
  - Space complexity в docstring
  - Обработку граничных случаев
"""

from __future__ import annotations

import heapq
from collections import deque
from typing import TypeVar

T = TypeVar("T")

# ===========================================================================
# SORTING ALGORITHMS
# ===========================================================================

def quicksort(arr: list[int]) -> list[int]:
    """
    Quick Sort — рандомизированный для защиты от O(n²) худшего случая.
    Time:  O(n log n) average, O(n²) worst (крайне редко при рандомизации)
    Space: O(log n) стек рекурсии
    Stable: Нет. Предпочтительнее merge sort когда нужна стабильность.
    """
    if len(arr) <= 1:
        return arr
    import random
    pivot = random.choice(arr)
    left = [x for x in arr if x < pivot]
    mid = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + mid + quicksort(right)


def mergesort(arr: list[int]) -> list[int]:
    """
    Merge Sort — стабильная сортировка.
    Time:  O(n log n) — гарантировано во всех случаях
    Space: O(n) — вспомогательный массив при merge
    Stable: Да. Предпочтительна для linked lists и external sort.
    """
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = mergesort(arr[:mid])
    right = mergesort(arr[mid:])
    return _merge(left, right)


def _merge(left: list[int], right: list[int]) -> list[int]:
    result: list[int] = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i]); i += 1
        else:
            result.append(right[j]); j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result


def heapsort(arr: list[int]) -> list[int]:
    """
    Heap Sort — in-place, не стабильный.
    Time:  O(n log n) — гарантировано
    Space: O(1) если in-place
    Используется когда важна гарантия O(n log n) и O(1) памяти.
    """
    arr = arr.copy()
    n = len(arr)

    def heapify(a: list[int], n: int, i: int) -> None:
        largest = i
        l, r = 2 * i + 1, 2 * i + 2
        if l < n and a[l] > a[largest]: largest = l
        if r < n and a[r] > a[largest]: largest = r
        if largest != i:
            a[i], a[largest] = a[largest], a[i]
            heapify(a, n, largest)

    for i in range(n // 2 - 1, -1, -1):
        heapify(arr, n, i)
    for i in range(n - 1, 0, -1):
        arr[0], arr[i] = arr[i], arr[0]
        heapify(arr, i, 0)
    return arr


# ===========================================================================
# GRAPH ALGORITHMS
# ===========================================================================

Graph = dict[str, list[tuple[str, int]]]  # node -> [(neighbor, weight)]


def bfs(graph: dict[str, list[str]], start: str) -> list[str]:
    """
    BFS — обход в ширину. Находит кратчайший путь в невзвешенном графе.
    Time:  O(V + E)
    Space: O(V)
    """
    visited: set[str] = {start}
    queue: deque[str] = deque([start])
    order: list[str] = []

    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    return order


def dfs(graph: dict[str, list[str]], start: str) -> list[str]:
    """
    DFS — итеративный (не рекурсивный — нет stack overflow на глубоких графах).
    Time:  O(V + E)
    Space: O(V)
    """
    visited: set[str] = set()
    stack: list[str] = [start]
    order: list[str] = []

    while stack:
        node = stack.pop()
        if node in visited:
            continue
        visited.add(node)
        order.append(node)
        for neighbor in reversed(graph.get(node, [])):
            if neighbor not in visited:
                stack.append(neighbor)
    return order


def dijkstra(graph: Graph, start: str) -> dict[str, float]:
    """
    Dijkstra — кратчайший путь для невзвешенных и взвешенных графов (веса >= 0).
    Time:  O((V + E) log V) с min-heap
    Space: O(V)
    ВАЖНО: не работает с отрицательными весами (используйте Bellman-Ford).
    """
    dist: dict[str, float] = {start: 0.0}
    heap: list[tuple[float, str]] = [(0.0, start)]

    while heap:
        d, u = heapq.heappop(heap)
        if d > dist.get(u, float("inf")):
            continue  # Устаревшая запись
        for v, w in graph.get(u, []):
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
    return dist


def topological_sort(graph: dict[str, list[str]]) -> list[str]:
    """
    Топологическая сортировка (Kahn's algorithm).
    Time:  O(V + E)
    Space: O(V)
    Raises ValueError если граф содержит цикл (не DAG).
    """
    from collections import Counter
    in_degree: Counter[str] = Counter()
    for node, neighbors in graph.items():
        in_degree.setdefault(node, 0)
        for n in neighbors:
            in_degree[n] += 1

    queue: deque[str] = deque(n for n, d in in_degree.items() if d == 0)
    result: list[str] = []
    while queue:
        node = queue.popleft()
        result.append(node)
        for neighbor in graph.get(node, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != len(in_degree):
        raise ValueError("Граф содержит цикл — топологическая сортировка невозможна")
    return result


# ===========================================================================
# DYNAMIC PROGRAMMING
# ===========================================================================

def longest_common_subsequence(s1: str, s2: str) -> int:
    """
    LCS — классическая DP задача.
    Time:  O(m * n)
    Space: O(m * n) — можно оптимизировать до O(min(m,n)) через rolling array.
    """
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s1[i - 1] == s2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[m][n]


def knapsack_01(weights: list[int], values: list[int], capacity: int) -> int:
    """
    0/1 Knapsack — каждый предмет берём не более одного раза.
    Time:  O(n * W)
    Space: O(W) — rolling array оптимизация
    """
    n = len(weights)
    dp = [0] * (capacity + 1)
    for i in range(n):
        for w in range(capacity, weights[i] - 1, -1):  # Reverse для 0/1
            dp[w] = max(dp[w], dp[w - weights[i]] + values[i])
    return dp[capacity]


def coin_change(coins: list[int], amount: int) -> int:
    """
    Минимальное количество монет (Unbounded Knapsack вариант).
    Time:  O(amount * len(coins))
    Space: O(amount)
    Возвращает -1 если сдача невозможна.
    """
    dp = [float("inf")] * (amount + 1)
    dp[0] = 0
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a:
                dp[a] = min(dp[a], dp[a - c] + 1)
    return int(dp[amount]) if dp[amount] != float("inf") else -1


# ===========================================================================
# BINARY SEARCH VARIANTS
# ===========================================================================

def binary_search(arr: list[int], target: int) -> int:
    """
    Стандартный binary search.
    Time:  O(log n)
    Space: O(1)
    Возвращает индекс или -1.
    """
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2  # Защита от integer overflow (актуально в Java/C++)
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


def lower_bound(arr: list[int], target: int) -> int:
    """
    Левая граница: первый индекс >= target.
    Time:  O(log n). Аналог std::lower_bound в C++.
    """
    lo, hi = 0, len(arr)
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo


def upper_bound(arr: list[int], target: int) -> int:
    """
    Правая граница: первый индекс > target.
    Time:  O(log n). Аналог std::upper_bound в C++.
    count of target = upper_bound - lower_bound.
    """
    lo, hi = 0, len(arr)
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] <= target:
            lo = mid + 1
        else:
            hi = mid
    return lo


# ===========================================================================
# Точка входа / демонстрация
# ===========================================================================
if __name__ == "__main__":
    import random

    arr = random.sample(range(100), 15)
    print(f"Input:     {arr}")
    print(f"QuickSort: {quicksort(arr)}")
    print(f"MergeSort: {mergesort(arr)}")
    print(f"HeapSort:  {heapsort(arr)}")

    graph_unweighted = {"A": ["B", "C"], "B": ["D"], "C": ["D", "E"], "D": [], "E": []}
    print(f"\nBFS from A: {bfs(graph_unweighted, 'A')}")
    print(f"DFS from A: {dfs(graph_unweighted, 'A')}")

    graph_weighted: Graph = {
        "A": [("B", 1), ("C", 4)],
        "B": [("C", 2), ("D", 5)],
        "C": [("D", 1)],
        "D": [],
    }
    print(f"\nDijkstra from A: {dijkstra(graph_weighted, 'A')}")
    print(f"Topological: {topological_sort(graph_unweighted)}")

    print(f"\nLCS('ABCBDAB', 'BDCAB'): {longest_common_subsequence('ABCBDAB', 'BDCAB')}")
    print(f"0/1 Knapsack: {knapsack_01([2,3,4,5],[3,4,5,6], 8)}")
    print(f"Coin change [1,5,10] for 27: {coin_change([1,5,10], 27)}")

    sorted_arr = sorted(arr)
    target = sorted_arr[5]
    print(f"\nBinary search {target} in {sorted_arr}: idx={binary_search(sorted_arr, target)}")
    print(f"Lower bound {target}: {lower_bound(sorted_arr, target)}")
    print(f"Upper bound {target}: {upper_bound(sorted_arr, target)}")
