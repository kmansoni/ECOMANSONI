# Архитектура расширенного контекстного окна

## Содержание

1. [Обзор](#обзор)
2. [Иерархическое управление памятью](#иерархическое-управление-памятью)
3. [Механизмы сжатия контекста](#механизмы-сжатия-контекста)
4. [Стратегии скользящего окна](#стратегии-скользящего-окна)
5. [Векторное извлечение (RAG)](#векторное-извлечение-rag)
6. [Системы чекпоинтов и снапшотов](#системы-чекпоинтов-и-снапшотов)
7. [Индексация памяти](#индексация-памяти)

---

## Обзор

### Проблема

Традиционные контекстные окна ограничены размером (от 4K до 200K токенов). Для сложных задач разработки ПО требуется:

- Хранение полной истории проекта
- Контекст всех предыдущих решений
- Документация и спецификации
- Кодовая база целиком
- История обсуждений и решений

### Решение

Архитектура расширенного контекстного окна с поддержкой до **10 000 000 токенов** с нулевой потерей памяти.

### Ключевые принципы

1. **Иерархичность** — Многоуровневая система памяти с разными характеристиками
2. **Прозрачность** — Автоматическое управление миграцией данных между уровнями
3. **Эффективность** — Интеллектуальное сжатие с сохранением семантики
4. **Доступность** — O(1) извлечение любого ранее обработанного сегмента

---

## Иерархическое управление памятью

### Архитектура уровней

```
┌─────────────────────────────────────────────────────────────┐
│                    Уровень 1: In-Context                     │
│                    (До 200K токенов)                         │
│  • Активный контекст                                        │
│  • Текущая задача                                           │
│  • Недавние взаимодействия                                  │
│  • Промежуточные результаты                                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ (Миграция при заполнении)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Уровень 2: Session Memory                 │
│                    (До 2M токенов)                           │
│  • Сжатые суммаризации                                      │
│  • Ключевые решения                                         │
│  • Важные контексты                                         │
│  • Прогресс задач                                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ (Миграция при завершении сессии)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Уровень 3: Persistent Memory              │
│                    (До 10M+ токенов)                         │
│  • Векторное хранилище                                      │
│  • Структурированная БД                                     │
│  • Полная история                                           │
│  • Архивные данные                                          │
└─────────────────────────────────────────────────────────────┘
```

### Спецификация уровней

#### Уровень 1: In-Context Memory

```typescript
interface InContextMemory {
  // Конфигурация
  maxTokens: 200_000;
  evictionPolicy: 'PRIORITY_BASED';
  
  // Структура данных
  entries: ContextEntry[];
  currentTokenCount: number;
  
  // Методы
  add(entry: ContextEntry): Promise<void>;
  get(key: string): Promise<ContextEntry | null>;
  search(query: string): Promise<ContextEntry[]>;
  evict(strategy: EvictionStrategy): Promise<void>;
}

interface ContextEntry {
  id: string;
  type: 'CODE' | 'TEXT' | 'DECISION' | 'RESULT' | 'CONTEXT';
  content: string;
  tokenCount: number;
  priority: number; // 0-1
  timestamp: Date;
  accessCount: number;
  lastAccessed: Date;
  metadata: Record<string, any>;
}
```

#### Уровень 2: Session Memory

```typescript
interface SessionMemory {
  // Конфигурация
  maxTokens: 2_000_000;
  compressionRatio: 0.1; // 10:1 сжатие
  
  // Структура данных
  compressedEntries: CompressedEntry[];
  summaries: SessionSummary[];
  decisions: DecisionLog[];
  
  // Методы
  compress(entry: ContextEntry): Promise<CompressedEntry>;
  decompress(entry: CompressedEntry): Promise<ContextEntry>;
  summarize(session: Session): Promise<SessionSummary>;
  retrieve(query: string): Promise<CompressedEntry[]>;
}

interface CompressedEntry {
  id: string;
  originalId: string;
  compressedContent: string;
  originalTokenCount: number;
  compressedTokenCount: number;
  compressionRatio: number;
  semanticHash: string;
  keywords: string[];
  embedding: number[];
}
```

#### Уровень 3: Persistent Memory

```typescript
interface PersistentMemory {
  // Векторное хранилище
  vectorStore: VectorStore;
  
  // Структурированная БД
  relationalDB: RelationalDB;
  
  // Методы
  store(entry: MemoryEntry): Promise<string>;
  retrieve(id: string): Promise<MemoryEntry | null>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  delete(id: string): Promise<void>;
  archive(id: string): Promise<void>;
}

interface MemoryEntry {
  id: string;
  type: string;
  content: any;
  embedding: number[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

### Протоколы миграции данных

#### Миграция из Level 1 в Level 2

```typescript
class L1ToL2Migration {
  private triggerThreshold = 0.8; // 80% заполнения
  
  async checkAndMigrate(memory: InContextMemory): Promise<void> {
    const utilization = memory.currentTokenCount / memory.maxTokens;
    
    if (utilization > this.triggerThreshold) {
      await this.performMigration(memory);
    }
  }
  
  private async performMigration(memory: InContextMemory): Promise<void> {
    // 1. Выбор кандидатов на миграцию
    const candidates = this.selectMigrationCandidates(memory);
    
    // 2. Сжатие контента
    const compressed = await this.compressEntries(candidates);
    
    // 3. Сохранение в Level 2
    await this.storeInL2(compressed);
    
    // 4. Удаление из Level 1
    await this.removeFromL1(memory, candidates);
    
    // 5. Обновление индексов
    await this.updateIndices(candidates, compressed);
  }
  
  private selectMigrationCandidates(
    memory: InContextMemory
  ): ContextEntry[] {
    return memory.entries
      .filter(entry => entry.priority < 0.5) // Низкий приоритет
      .filter(entry => this.isStale(entry)) // Устаревшие
      .filter(entry => entry.accessCount < 3) // Редко используемые
      .sort((a, b) => this.calculateMigrationScore(a) - 
                       this.calculateMigrationScore(b))
      .slice(0, Math.floor(memory.entries.length * 0.3)); // 30% записей
  }
}
```

#### Миграция из Level 2 в Level 3

```typescript
class L2ToL3Migration {
  async migrateOnSessionEnd(sessionId: string): Promise<void> {
    // 1. Получение всех записей сессии
    const entries = await this.getSessionEntries(sessionId);
    
    // 2. Генерация финальной суммаризации
    const summary = await this.generateFinalSummary(entries);
    
    // 3. Создание эмбеддингов
    const embeddings = await this.generateEmbeddings(entries);
    
    // 4. Сохранение в Level 3
    await this.storeInL3(entries, summary, embeddings);
    
    // 5. Очистка Level 2
    await this.cleanupL2(sessionId);
  }
}
```

### Критерии promotion/demotion

```typescript
interface PromotionCriteria {
  // Критерии повышения уровня (L3 → L2 → L1)
  minAccessCount: number;
  minRecency: number; // ms
  minPriority: number;
  minRelevanceScore: number;
}

interface DemotionCriteria {
  // Критерии понижения уровня (L1 → L2 → L3)
  maxIdleTime: number; // ms
  maxAge: number; // ms
  minAccessCount: number;
  maxPriority: number;
}

class LevelManager {
  private promotionCriteria: PromotionCriteria = {
    minAccessCount: 5,
    minRecency: 3600000, // 1 час
    minPriority: 0.7,
    minRelevanceScore: 0.8
  };
  
  private demotionCriteria: DemotionCriteria = {
    maxIdleTime: 1800000, // 30 минут
    maxAge: 86400000, // 24 часа
    minAccessCount: 2,
    maxPriority: 0.3
  };
  
  async evaluatePromotion(entry: MemoryEntry): Promise<boolean> {
    return (
      entry.accessCount >= this.promotionCriteria.minAccessCount &&
      this.getRecency(entry) >= this.promotionCriteria.minRecency &&
      entry.priority >= this.promotionCriteria.minPriority
    );
  }
  
  async evaluateDemotion(entry: MemoryEntry): Promise<boolean> {
    return (
      this.getIdleTime(entry) >= this.demotionCriteria.maxIdleTime ||
      this.getAge(entry) >= this.demotionCriteria.maxAge ||
      entry.accessCount < this.demotionCriteria.minAccessCount
    );
  }
}
```

### Стратегии invalidation

```typescript
interface InvalidationStrategy {
  shouldInvalidate(entry: MemoryEntry, context: Context): boolean;
  invalidate(entry: MemoryEntry): Promise<void>;
}

class TimeBasedInvalidation implements InvalidationStrategy {
  private maxAge: number = 86400000 * 30; // 30 дней
  
  shouldInvalidate(entry: MemoryEntry): boolean {
    return Date.now() - entry.createdAt.getTime() > this.maxAge;
  }
  
  async invalidate(entry: MemoryEntry): Promise<void> {
    await this.moveToArchive(entry);
  }
}

class RelevanceBasedInvalidation implements InvalidationStrategy {
  private minRelevance: number = 0.1;
  
  shouldInvalidate(entry: MemoryEntry, context: Context): boolean {
    const relevance = this.calculateRelevance(entry, context);
    return relevance < this.minRelevance;
  }
  
  async invalidate(entry: MemoryEntry): Promise<void> {
    await this.compressAndArchive(entry);
  }
}

class ConsistencyBasedInvalidation implements InvalidationStrategy {
  shouldInvalidate(entry: MemoryEntry, context: Context): boolean {
    // Проверка согласованности с текущим состоянием
    return !this.isConsistent(entry, context);
  }
  
  async invalidate(entry: MemoryEntry): Promise<void> {
    await this.updateOrDelete(entry);
  }
}
```

---

## Механизмы сжатия контекста

### Абстрактивная суммаризация

```typescript
class AbstractiveSummarizer {
  async summarize(content: string, maxLength: number): Promise<string> {
    // Использование LLM для генерации суммаризации
    const prompt = `
      Создай краткую суммаризацию следующего контента,
      сохраняя ключевые моменты и решения:
      
      ${content}
      
      Максимальная длина: ${maxLength} токенов
    `;
    
    return await this.llm.generate(prompt);
  }
  
  async summarizeCode(code: string): Promise<CodeSummary> {
    // Специализированная суммаризация кода
    return {
      signature: this.extractSignature(code),
      purpose: await this.inferPurpose(code),
      dependencies: this.extractDependencies(code),
      keyDecisions: await this.extractDecisions(code),
      compressedImplementation: await this.compressImplementation(code)
    };
  }
}
```

### Extractive compression

```typescript
class ExtractiveCompressor {
  async compress(content: string, ratio: number): Promise<string> {
    // 1. Разбиение на предложения
    const sentences = this.splitIntoSentences(content);
    
    // 2. Оценка важности каждого предложения
    const scored = sentences.map(sentence => ({
      sentence,
      score: this.calculateImportance(sentence, content)
    }));
    
    // 3. Выбор наиболее важных предложений
    const selected = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.ceil(sentences.length * ratio))
      .map(item => item.sentence);
    
    // 4. Упорядочивание по исходному порядку
    return this.restoreOrder(selected, sentences);
  }
  
  private calculateImportance(
    sentence: string,
    context: string
  ): number {
    const factors = {
      position: this.getPositionScore(sentence, context),
      length: this.getLengthScore(sentence),
      keywords: this.getKeywordScore(sentence, context),
      uniqueness: this.getUniquenessScore(sentence, context)
    };
    
    return (
      factors.position * 0.2 +
      factors.length * 0.1 +
      factors.keywords * 0.4 +
      factors.uniqueness * 0.3
    );
  }
}
```

### Code-aware compression

```typescript
class CodeAwareCompressor {
  async compress(code: string): Promise<CompressedCode> {
    // 1. Парсинг AST
    const ast = this.parseAST(code);
    
    // 2. Извлечение сигнатур
    const signatures = this.extractSignatures(ast);
    
    // 3. Извлечение типов
    const types = this.extractTypes(ast);
    
    // 4. Извлечение контрактов
    const contracts = this.extractContracts(ast);
    
    // 5. Сжатие реализации
    const compressedImpl = await this.compressImplementation(ast);
    
    return {
      signatures,
      types,
      contracts,
      compressedImplementation: compressedImpl,
      originalSize: code.length,
      compressedSize: this.calculateSize(signatures, types, contracts, compressedImpl)
    };
  }
  
  private extractSignatures(ast: AST): FunctionSignature[] {
    return ast.functions.map(func => ({
      name: func.name,
      parameters: func.parameters.map(p => ({
        name: p.name,
        type: p.type
      })),
      returnType: func.returnType,
      visibility: func.visibility
    }));
  }
  
  private extractContracts(ast: AST): Contract[] {
    return ast.functions.map(func => ({
      name: func.name,
      preconditions: this.extractPreconditions(func),
      postconditions: this.extractPostconditions(func),
      invariants: this.extractInvariants(func)
    }));
  }
}
```

### Hierarchical summarization trees

```typescript
class HierarchicalSummarizer {
  async buildSummaryTree(documents: Document[]): Promise<SummaryTree> {
    // 1. Кластеризация документов
    const clusters = await this.clusterDocuments(documents);
    
    // 2. Суммаризация каждого кластера
    const clusterSummaries = await Promise.all(
      clusters.map(cluster => this.summarizeCluster(cluster))
    );
    
    // 3. Рекурсивное построение дерева
    return this.buildTree(clusterSummaries);
  }
  
  private async buildTree(
    summaries: Summary[]
  ): Promise<SummaryTree> {
    if (summaries.length <= 5) {
      // Базовый случай: создание корневого узла
      return {
        type: 'ROOT',
        summary: await this.combineSummaries(summaries),
        children: summaries.map(s => ({
          type: 'LEAF',
          summary: s,
          children: []
        }))
      };
    }
    
    // Рекурсивный случай: кластеризация и суммаризация
    const clusters = await this.clusterSummaries(summaries);
    const clusterSummaries = await Promise.all(
      clusters.map(cluster => this.combineSummaries(cluster))
    );
    
    return {
      type: 'INTERNAL',
      summary: await this.combineSummaries(clusterSummaries),
      children: await Promise.all(
        clusterSummaries.map(s => this.buildTree([s]))
      )
    };
  }
  
  async retrieveFromTree(
    tree: SummaryTree,
    query: string
  ): Promise<RetrievalResult> {
    // Навигация по дереву для извлечения релевантной информации
    const relevantNodes = this.findRelevantNodes(tree, query);
    
    return {
      summaries: relevantNodes.map(node => node.summary),
      path: this.getNavigationPath(tree, relevantNodes),
      confidence: this.calculateConfidence(relevantNodes, query)
    };
  }
}
```

---

## Стратегии скользящего окна

### Priority-based eviction

```typescript
class PriorityBasedEviction {
  private priorityWeights = {
    recency: 0.3,
    frequency: 0.3,
    relevance: 0.2,
    importance: 0.2
  };
  
  async selectForEviction(
    entries: ContextEntry[],
    requiredSpace: number
  ): Promise<ContextEntry[]> {
    // Оценка приоритета каждой записи
    const scored = entries.map(entry => ({
      entry,
      score: this.calculatePriority(entry)
    }));
    
    // Сортировка по приоритету (от низкого к высокому)
    scored.sort((a, b) => a.score - b.score);
    
    // Выбор записей для удаления
    const toEvict: ContextEntry[] = [];
    let freedSpace = 0;
    
    for (const { entry } of scored) {
      if (freedSpace >= requiredSpace) break;
      toEvict.push(entry);
      freedSpace += entry.tokenCount;
    }
    
    return toEvict;
  }
  
  private calculatePriority(entry: ContextEntry): number {
    const recency = this.getRecencyScore(entry);
    const frequency = this.getFrequencyScore(entry);
    const relevance = this.getRelevanceScore(entry);
    const importance = entry.priority;
    
    return (
      recency * this.priorityWeights.recency +
      frequency * this.priorityWeights.frequency +
      relevance * this.priorityWeights.relevance +
      importance * this.priorityWeights.importance
    );
  }
}
```

### Relevance scoring

```typescript
class RelevanceScorer {
  async scoreEntry(
    entry: ContextEntry,
    currentContext: Context
  ): Promise<number> {
    const factors = {
      semanticSimilarity: await this.calculateSemanticSimilarity(
        entry,
        currentContext
      ),
      topicalRelevance: this.calculateTopicalRelevance(
        entry,
        currentContext
      ),
      temporalRelevance: this.calculateTemporalRelevance(entry),
      taskRelevance: this.calculateTaskRelevance(
        entry,
        currentContext.currentTask
      )
    };
    
    return (
      factors.semanticSimilarity * 0.4 +
      factors.topicalRelevance * 0.3 +
      factors.temporalRelevance * 0.1 +
      factors.taskRelevance * 0.2
    );
  }
  
  private async calculateSemanticSimilarity(
    entry: ContextEntry,
    context: Context
  ): Promise<number> {
    const entryEmbedding = await this.getEmbedding(entry.content);
    const contextEmbedding = await this.getEmbedding(
      this.extractContextContent(context)
    );
    
    return this.cosineSimilarity(entryEmbedding, contextEmbedding);
  }
}
```

### Recency-weighted retention

```typescript
class RecencyWeightedRetention {
  private decayFactor = 0.95; // Экспоненциальный распад
  
  calculateRetentionScore(entry: ContextEntry): number {
    const age = Date.now() - entry.lastAccessed.getTime();
    const accessFrequency = entry.accessCount;
    
    // Экспоненциальный распад с учётом частоты доступа
    const timeDecay = Math.pow(this.decayFactor, age / 3600000); // За час
    const frequencyBoost = Math.log1p(accessFrequency);
    
    return timeDecay * frequencyBoost;
  }
  
  async selectForRetention(
    entries: ContextEntry[],
    maxEntries: number
  ): Promise<ContextEntry[]> {
    const scored = entries.map(entry => ({
      entry,
      score: this.calculateRetentionScore(entry)
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxEntries)
      .map(item => item.entry);
  }
}
```

### Task-aware context selection

```typescript
class TaskAwareContextSelector {
  async selectContext(
    task: Task,
    availableContext: ContextEntry[]
  ): Promise<ContextEntry[]> {
    // 1. Анализ требований задачи
    const requirements = await this.analyzeTaskRequirements(task);
    
    // 2. Оценка релевантности каждого контекста
    const scored = await Promise.all(
      availableContext.map(async entry => ({
        entry,
        score: await this.calculateTaskRelevance(entry, requirements)
      }))
    );
    
    // 3. Выбор наиболее релевантных
    const selected = scored
      .filter(item => item.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.calculateOptimalSize(task))
      .map(item => item.entry);
    
    // 4. Проверка на полноту
    const gaps = await this.identifyContextGaps(selected, requirements);
    
    if (gaps.length > 0) {
      // Дополнение недостающим контекстом
      const additional = await this.fillGaps(gaps, availableContext);
      selected.push(...additional);
    }
    
    return selected;
  }
  
  private async calculateTaskRelevance(
    entry: ContextEntry,
    requirements: TaskRequirements
  ): Promise<number> {
    const factors = {
      directMatch: this.checkDirectMatch(entry, requirements),
      dependencyMatch: await this.checkDependencyMatch(entry, requirements),
      patternMatch: await this.checkPatternMatch(entry, requirements),
      historicalRelevance: await this.checkHistoricalRelevance(entry, requirements)
    };
    
    return (
      factors.directMatch * 0.4 +
      factors.dependencyMatch * 0.3 +
      factors.patternMatch * 0.2 +
      factors.historicalRelevance * 0.1
    );
  }
}
```

---

## Векторное извлечение (RAG)

### Embedding strategies

```typescript
class EmbeddingStrategy {
  // Для кода
  async embedCode(code: string): Promise<number[]> {
    // Специализированный эмбеддинг для кода
    const features = {
      syntax: this.extractSyntaxFeatures(code),
      semantics: await this.extractSemanticFeatures(code),
      structure: this.extractStructuralFeatures(code),
      patterns: this.extractPatternFeatures(code)
    };
    
    return this.combineFeatures(features);
  }
  
  // Для текста
  async embedText(text: string): Promise<number[]> {
    // Стандартный текстовый эмбеддинг
    return await this.textEmbeddingModel.embed(text);
  }
  
  // Гибридный эмбеддинг
  async embedHybrid(content: Content): Promise<number[]> {
    if (content.type === 'CODE') {
      return this.embedCode(content.value);
    } else if (content.type === 'TEXT') {
      return this.embedText(content.value);
    } else {
      // Смешанный контент
      const codeParts = this.extractCodeParts(content.value);
      const textParts = this.extractTextParts(content.value);
      
      const codeEmbeddings = await Promise.all(
        codeParts.map(p => this.embedCode(p))
      );
      const textEmbeddings = await Promise.all(
        textParts.map(p => this.embedText(p))
      );
      
      return this.combineEmbeddings([
        ...codeEmbeddings,
        ...textEmbeddings
      ]);
    }
  }
}
```

### Hybrid search

```typescript
class HybridSearchEngine {
  async search(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    // 1. Семантический поиск
    const semanticResults = await this.semanticSearch(query, options);
    
    // 2. Ключевой поиск
    const keywordResults = await this.keywordSearch(query, options);
    
    // 3. Структурный поиск (для кода)
    const structuralResults = await this.structuralSearch(query, options);
    
    // 4. Объединение и ранжирование
    const combined = this.combineResults(
      semanticResults,
      keywordResults,
      structuralResults
    );
    
    // 5. Re-ranking
    const reranked = await this.rerank(combined, query);
    
    return reranked.slice(0, options.limit);
  }
  
  private async semanticSearch(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.embedQuery(query);
    
    return await this.vectorStore.search({
      vector: queryEmbedding,
      topK: options.limit * 2,
      filter: options.filters
    });
  }
  
  private async keywordSearch(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const keywords = this.extractKeywords(query);
    
    return await this.invertedIndex.search({
      keywords,
      operator: 'OR',
      limit: options.limit * 2
    });
  }
  
  private async structuralSearch(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    // Поиск по структуре кода (AST)
    const astPattern = this.parseQueryToAST(query);
    
    return await this.astIndex.search({
      pattern: astPattern,
      limit: options.limit * 2
    });
  }
}
```

### Re-ranking algorithms

```typescript
class ReRanker {
  async rerank(
    results: SearchResult[],
    query: string
  ): Promise<SearchResult[]> {
    // 1. Cross-encoder scoring
    const crossEncoderScores = await this.crossEncoderScore(
      results,
      query
    );
    
    // 2. Контекстное оценивание
    const contextScores = await this.contextScore(results, query);
    
    // 3. Разнообразие
    const diversityScores = this.diversityScore(results);
    
    // 4. Комбинирование скоров
    const combined = results.map((result, i) => ({
      result,
      score: (
        crossEncoderScores[i] * 0.5 +
        contextScores[i] * 0.3 +
        diversityScores[i] * 0.2
      )
    }));
    
    return combined
      .sort((a, b) => b.score - a.score)
      .map(item => item.result);
  }
  
  private diversityScore(results: SearchResult[]): number[] {
    // Оценка разнообразия результатов
    const scores: number[] = [];
    
    for (let i = 0; i < results.length; i++) {
      let minDistance = Infinity;
      
      for (let j = 0; j < i; j++) {
        const distance = this.calculateDistance(
          results[i].embedding,
          results[j].embedding
        );
        minDistance = Math.min(minDistance, distance);
      }
      
      scores.push(minDistance === Infinity ? 1 : minDistance);
    }
    
    return scores;
  }
}
```

### Context fusion techniques

```typescript
class ContextFusion {
  async fuseContext(
    retrievedContext: ContextEntry[],
    currentContext: Context
  ): Promise<FusedContext> {
    // 1. Дедупликация
    const deduplicated = await this.deduplicate(retrievedContext);
    
    // 2. Ранжирование по релевантности
    const ranked = await this.rankByRelevance(
      deduplicated,
      currentContext
    );
    
    // 3. Упорядочивание
    const ordered = this.orderForCoherence(ranked);
    
    // 4. Сжатие при необходимости
    const compressed = await this.compressIfNeeded(
      ordered,
      this.maxContextSize
    );
    
    // 5. Форматирование
    return this.formatForConsumption(compressed);
  }
  
  private orderForCoherence(entries: ContextEntry[]): ContextEntry[] {
    // Упорядочивание для связности контекста
    return entries.sort((a, b) => {
      // По типу
      const typeOrder = this.getTypeOrder(a.type) - this.getTypeOrder(b.type);
      if (typeOrder !== 0) return typeOrder;
      
      // По времени
      return a.timestamp.getTime() - b.timestamp.getTime();
    });
  }
}
```

---

## Системы чекпоинтов и снапшотов

### Incremental snapshots

```typescript
class IncrementalSnapshotManager {
  private baseSnapshot: Snapshot | null = null;
  private deltas: Delta[] = [];
  
  async createSnapshot(state: SystemState): Promise<Snapshot> {
    if (!this.baseSnapshot) {
      // Полный снапшот
      this.baseSnapshot = await this.createFullSnapshot(state);
      return this.baseSnapshot;
    }
    
    // Инкрементальный снапшот
    const delta = await this.calculateDelta(
      this.baseSnapshot.state,
      state
    );
    
    this.deltas.push(delta);
    
    return {
      type: 'INCREMENTAL',
      baseSnapshotId: this.baseSnapshot.id,
      delta,
      timestamp: new Date()
    };
  }
  
  async restoreSnapshot(snapshot: Snapshot): Promise<SystemState> {
    if (snapshot.type === 'FULL') {
      return snapshot.state;
    }
    
    // Восстановление из базового снапшота + дельт
    let state = await this.getBaseSnapshot(snapshot.baseSnapshotId);
    
    const deltas = await this.getDeltas(
      snapshot.baseSnapshotId,
      snapshot.timestamp
    );
    
    for (const delta of deltas) {
      state = this.applyDelta(state, delta);
    }
    
    return state;
  }
}
```

### Differential storage

```typescript
class DifferentialStorage {
  async store(current: State, previous: State): Promise<Diff> {
    const diff = this.calculateDiff(previous, current);
    
    // Сохранение только изменений
    await this.saveDiff(diff);
    
    return diff;
  }
  
  private calculateDiff(previous: State, current: State): Diff {
    const changes: Change[] = [];
    
    // Сравнение полей
    for (const key of Object.keys(current)) {
      if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
        changes.push({
          type: 'UPDATE',
          path: key,
          oldValue: previous[key],
          newValue: current[key]
        });
      }
    }
    
    // Проверка удалённых полей
    for (const key of Object.keys(previous)) {
      if (!(key in current)) {
        changes.push({
          type: 'DELETE',
          path: key,
          oldValue: previous[key]
        });
      }
    }
    
    return {
      timestamp: new Date(),
      changes,
      checksum: this.calculateChecksum(current)
    };
  }
}
```

### Consistency guarantees

```typescript
class ConsistencyManager {
  async ensureConsistency(
    snapshot: Snapshot
  ): Promise<ConsistencyReport> {
    const checks = [
      this.checkDataIntegrity(snapshot),
      this.checkReferentialIntegrity(snapshot),
      this.checkTemporalConsistency(snapshot),
      this.checkSemanticConsistency(snapshot)
    ];
    
    const results = await Promise.all(checks);
    
    return {
      passed: results.every(r => r.passed),
      checks: results,
      recommendations: this.generateRecommendations(results)
    };
  }
  
  private async checkDataIntegrity(
    snapshot: Snapshot
  ): Promise<CheckResult> {
    const calculatedChecksum = this.calculateChecksum(snapshot.state);
    const storedChecksum = snapshot.checksum;
    
    return {
      name: 'DATA_INTEGRITY',
      passed: calculatedChecksum === storedChecksum,
      details: {
        calculated: calculatedChecksum,
        stored: storedChecksum
      }
    };
  }
}
```

### Snapshot compaction policies

```typescript
class SnapshotCompactionPolicy {
  private maxSnapshots = 100;
  private maxAge = 86400000 * 7; // 7 дней
  
  async compact(snapshots: Snapshot[]): Promise<Snapshot[]> {
    // 1. Удаление старых снапшотов
    const recent = snapshots.filter(
      s => Date.now() - s.timestamp.getTime() < this.maxAge
    );
    
    // 2. Удаление избыточных снапшотов
    if (recent.length > this.maxSnapshots) {
      const toKeep = this.selectSnapshotsToKeep(recent);
      const toDelete = recent.filter(s => !toKeep.includes(s));
      
      await this.deleteSnapshots(toDelete);
      return toKeep;
    }
    
    return recent;
  }
  
  private selectSnapshotsToKeep(snapshots: Snapshot[]): Snapshot[] {
    // Стратегия: сохранять ключевые снапшоты
    return snapshots
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, this.maxSnapshots);
  }
}
```

---

## Индексация памяти

### Inverted indices

```typescript
class InvertedIndex {
  private index: Map<string, Set<string>> = new Map();
  
  async indexEntry(entry: MemoryEntry): Promise<void> {
    const keywords = this.extractKeywords(entry);
    
    for (const keyword of keywords) {
      if (!this.index.has(keyword)) {
        this.index.set(keyword, new Set());
      }
      this.index.get(keyword)!.add(entry.id);
    }
  }
  
  async search(keywords: string[]): Promise<string[]> {
    const results = new Set<string>();
    
    for (const keyword of keywords) {
      const entryIds = this.index.get(keyword);
      if (entryIds) {
        for (const id of entryIds) {
          results.add(id);
        }
      }
    }
    
    return Array.from(results);
  }
  
  async removeEntry(entryId: string): Promise<void> {
    for (const [keyword, entryIds] of this.index) {
      entryIds.delete(entryId);
      if (entryIds.size === 0) {
        this.index.delete(keyword);
      }
    }
  }
}
```

### Code structure indices (AST-based)

```typescript
class ASTIndex {
  private functionIndex: Map<string, CodeLocation> = new Map();
  private classIndex: Map<string, CodeLocation> = new Map();
  private typeIndex: Map<string, CodeLocation> = new Map();
  
  async indexCode(code: string, fileId: string): Promise<void> {
    const ast = this.parseAST(code);
    
    // Индексация функций
    for (const func of ast.functions) {
      this.functionIndex.set(func.name, {
        fileId,
        startLine: func.loc.start.line,
        endLine: func.loc.end.line
      });
    }
    
    // Индексация классов
    for (const cls of ast.classes) {
      this.classIndex.set(cls.name, {
        fileId,
        startLine: cls.loc.start.line,
        endLine: cls.loc.end.line
      });
    }
    
    // Индексация типов
    for (const type of ast.types) {
      this.typeIndex.set(type.name, {
        fileId,
        startLine: type.loc.start.line,
        endLine: type.loc.end.line
      });
    }
  }
  
  async findFunction(name: string): Promise<CodeLocation | null> {
    return this.functionIndex.get(name) || null;
  }
  
  async findClass(name: string): Promise<CodeLocation | null> {
    return this.classIndex.get(name) || null;
  }
}
```

### Decision logs with causal linking

```typescript
class DecisionLog {
  private decisions: Map<string, Decision> = new Map();
  private causalLinks: Map<string, string[]> = new Map();
  
  async logDecision(decision: Decision): Promise<void> {
    this.decisions.set(decision.id, decision);
    
    // Установка причинно-следственных связей
    if (decision.causedBy) {
      for (const causeId of decision.causedBy) {
        if (!this.causalLinks.has(causeId)) {
          this.causalLinks.set(causeId, []);
        }
        this.causalLinks.get(causeId)!.push(decision.id);
      }
    }
  }
  
  async getDecisionChain(decisionId: string): Promise<Decision[]> {
    const chain: Decision[] = [];
    const visited = new Set<string>();
    
    const traverse = async (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      
      const decision = this.decisions.get(id);
      if (decision) {
        chain.push(decision);
        
        const causes = decision.causedBy || [];
        for (const causeId of causes) {
          await traverse(causeId);
        }
      }
    };
    
    await traverse(decisionId);
    return chain.reverse();
  }
  
  async getConsequences(decisionId: string): Promise<Decision[]> {
    const consequences: Decision[] = [];
    const visited = new Set<string>();
    
    const traverse = async (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      
      const effectIds = this.causalLinks.get(id) || [];
      for (const effectId of effectIds) {
        const decision = this.decisions.get(effectId);
        if (decision) {
          consequences.push(decision);
          await traverse(effectId);
        }
      }
    };
    
    await traverse(decisionId);
    return consequences;
  }
}
```

### Conversation threading with topic segmentation

```typescript
class ConversationIndex {
  private threads: Map<string, Thread> = new Map();
  private topicIndex: Map<string, string[]> = new Map();
  
  async addMessage(message: Message): Promise<void> {
    // Определение треда
    const threadId = await this.determineThread(message);
    
    // Определение топика
    const topic = await this.classifyTopic(message);
    
    // Добавление в тред
    if (!this.threads.has(threadId)) {
      this.threads.set(threadId, {
        id: threadId,
        messages: [],
        topics: new Set()
      });
    }
    
    const thread = this.threads.get(threadId)!;
    thread.messages.push(message);
    thread.topics.add(topic);
    
    // Обновление индекса топиков
    if (!this.topicIndex.has(topic)) {
      this.topicIndex.set(topic, []);
    }
    this.topicIndex.get(topic)!.push(threadId);
  }
  
  async searchByTopic(topic: string): Promise<Message[]> {
    const threadIds = this.topicIndex.get(topic) || [];
    const messages: Message[] = [];
    
    for (const threadId of threadIds) {
      const thread = this.threads.get(threadId);
      if (thread) {
        messages.push(...thread.messages);
      }
    }
    
    return messages;
  }
}
```

---

## Следующие разделы

- [Рабочие процессы](../workflows/README.md)
- [Технические спецификации](../technical-specs/README.md)
- [Дополнительные материалы](../appendix/README.md)
