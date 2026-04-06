# Web Worker Patterns

## Описание

Скилл для выноса тяжёлых вычислений в Web Workers: offscreen computation, Comlink для удобного API, SharedArrayBuffer для shared memory, transferable objects.

## Когда использовать

- Парсинг больших JSON/CSV (>1MB)
- Криптография: хеширование, E2EE операции
- Обработка изображений (resize, filters, compression)
- Сортировка/фильтрация >10 000 элементов
- Markdown/code highlighting больших документов
- Real-time аудио/видео обработка

## Стек

- `new Worker(new URL(..., import.meta.url))` — Vite-совместимый синтаксис
- `comlink` — RPC-обёртка, вызывай worker как обычную async функцию
- `transferable` — zero-copy передача ArrayBuffer

## Чеклист

- [ ] Worker создаётся один раз, не на каждый вызов
- [ ] Comlink proxy для типизированного API
- [ ] Transferable objects для ArrayBuffer (zero-copy)
- [ ] Graceful fallback: если Worker не поддерживается — main thread
- [ ] Terminate worker при unmount компонента
- [ ] Progress callback для длительных операций
- [ ] Error handling: `worker.onerror` + try/catch в worker
- [ ] Не передавать DOM-ноды и функции (не сериализуются)

## Пример: worker с Comlink

```ts
// workers/crypto.worker.ts
import * as Comlink from 'comlink'

const cryptoWorker = {
  async hashPassword(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
    return crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
      await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']),
      256,
    )
  },

  async encryptMessage(plaintext: string, key: CryptoKey): Promise<ArrayBuffer> {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
    const result = new Uint8Array(12 + encrypted.byteLength)
    result.set(iv, 0)
    result.set(new Uint8Array(encrypted), 12)
    return Comlink.transfer(result.buffer, [result.buffer])
  },
}

Comlink.expose(cryptoWorker)
export type CryptoWorker = typeof cryptoWorker
```

## Пример: хук для worker

```tsx
import * as Comlink from 'comlink'
import type { CryptoWorker } from '@/workers/crypto.worker'

let workerInstance: Comlink.Remote<CryptoWorker> | null = null

function getCryptoWorker() {
  if (!workerInstance) {
    const raw = new Worker(new URL('@/workers/crypto.worker.ts', import.meta.url), { type: 'module' })
    workerInstance = Comlink.wrap<CryptoWorker>(raw)
  }
  return workerInstance
}

function useCryptoWorker() {
  const worker = useMemo(() => getCryptoWorker(), [])
  return worker
}
```

## Паттерн: progress reporting

```ts
// worker
async function processLargeDataset(
  data: ArrayBuffer,
  onProgress: (pct: number) => void,
) {
  const view = new Float64Array(data)
  for (let i = 0; i < view.length; i += 1000) {
    // heavy computation chunk
    processChunk(view, i, Math.min(i + 1000, view.length))
    onProgress(Math.round((i / view.length) * 100))
  }
}

// Comlink.proxy для callback
worker.processLargeDataset(buffer, Comlink.proxy(pct => setProgress(pct)))
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| `new Worker()` на каждый вызов | Overhead создания ~50ms, утечка памяти | Singleton или пул workers |
| `JSON.stringify` больших ArrayBuffer | Копирование + сериализация, медленно | `Comlink.transfer()` — zero-copy |
| Worker без terminate | Утечка памяти, zombie threads | `worker.terminate()` в cleanup |
| Синхронный postMessage loop | Блокирует message queue | Batch обработка с chunks |
| DOM-операции в worker | Workers не имеют доступа к DOM | Вернуть результат, обновить DOM в main |
| Без fallback для Safari < 15 | Module workers не поддерживаются | Feature detect + main thread fallback |
