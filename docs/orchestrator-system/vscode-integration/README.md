# Интеграция с VS Code (VS Code Integration)

> Нативная двусторонняя интеграция AI агента с редактором VS Code: чтение/запись файлов, выполнение команд в терминале, навигация по проекту, LSP-анализ кода.

---

## Содержание

- [Обзор](#обзор)
- [Архитектура расширения](#архитектура-расширения)
- [Возможности интеграции](#возможности-интеграции)
- [File System API](#file-system-api)
- [Terminal API](#terminal-api)
- [Language Intelligence](#language-intelligence)
- [Workspace Analysis](#workspace-analysis)
- [Потоки данных](#потоки-данных)
- [Конфигурация](#конфигурация)
- [Безопасность](#безопасность)

---

## Обзор

VS Code расширение является **основным интерфейсом взаимодействия** агентной системы с рабочей средой разработчика. Оно обеспечивает агентам полный доступ к контексту IDE: открытые файлы, структура проекта, языковой сервер, терминал.

```
┌─────────────────────────────────────────────────┐
│                  VS Code IDE                    │
│                                                 │
│  ┌──────────────┐   ┌─────────────────────────┐ │
│  │  Editor UI   │   │   AI Companion Extension│ │
│  │              │◄──│                         │ │
│  │  Files, Tabs │   │  ┌───────────────────┐  │ │
│  │  Terminal    │──►│  │  Extension Host   │  │ │
│  │  Problems    │   │  │  (Node.js)        │  │ │
│  └──────────────┘   │  └───────┬───────────┘  │ │
│                     └──────────│───────────────┘ │
└────────────────────────────────│────────────────┘
                                 │ IPC / HTTP
                     ┌───────────▼───────────────┐
                     │   Orchestration System    │
                     │   (Python Backend)        │
                     └───────────────────────────┘
```

---

## Архитектура расширения

### Компоненты расширения

```
extension/
├── src/
│   ├── extension.ts           # Точка активации, регистрация команд
│   ├── agent-client.ts        # HTTP клиент к Python backend
│   ├── file-system.ts         # Операции с файловой системой
│   ├── terminal-manager.ts    # Управление терминалами
│   ├── workspace-analyzer.ts  # Анализ структуры проекта
│   ├── language-client.ts     # LSP интеграция
│   └── chat-panel.ts          # WebView панель чата
├── package.json               # Extension manifest
└── tsconfig.json
```

### Протокол взаимодействия

Расширение и Python-бэкенд общаются через **HTTP/WebSocket**:

```
Extension (Node.js) ──HTTP POST──► /api/agent/message
                    ◄─WebSocket──  /ws/agent/stream
```

Для операций с файловой системой и терминалом — **обратные вызовы** (backend → extension):

```
Backend ──HTTP POST──► Extension Local Server (port 3001)
                       /api/vscode/execute-command
                       /api/vscode/read-file
                       /api/vscode/write-file
```

---

## Возможности интеграции

| Категория | Возможность | API |
|-----------|-------------|-----|
| **Файлы** | Чтение файлов | `vscode.workspace.fs.readFile()` |
| **Файлы** | Запись файлов | `vscode.workspace.fs.writeFile()` |
| **Файлы** | Создание/удаление | `vscode.workspace.fs.delete()` |
| **Файлы** | Просмотр diff | `vscode.commands.executeCommand('vscode.diff', ...)` |
| **Навигация** | Открыть файл | `vscode.window.showTextDocument()` |
| **Навигация** | Перейти к строке | `editor.revealRange()` |
| **Навигация** | Перейти к символу | `vscode.commands.executeCommand('workbench.action.gotoSymbol')` |
| **Терминал** | Создать терминал | `vscode.window.createTerminal()` |
| **Терминал** | Выполнить команду | `terminal.sendText(cmd)` |
| **LSP** | Получить символы | `vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider')` |
| **LSP** | Найти ссылки | `vscode.commands.executeCommand('vscode.executeReferenceProvider')` |
| **LSP** | Диагностика | `vscode.languages.getDiagnostics()` |
| **Workspace** | Структура проекта | `vscode.workspace.findFiles()` |
| **Workspace** | Текущий файл | `vscode.window.activeTextEditor` |
| **UI** | Показать уведомление | `vscode.window.showInformationMessage()` |
| **UI** | Открыть WebView | `vscode.window.createWebviewPanel()` |

---

## File System API

### Чтение файла

```typescript
// extension/src/file-system.ts
async function readFile(path: string): Promise<string> {
    const uri = vscode.Uri.file(path);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
}
```

Агент запрашивает через backend API:

```http
POST /api/vscode/read-file
Content-Type: application/json

{
  "path": "/workspace/src/auth/jwt.py",
  "encoding": "utf-8"
}
```

### Запись файла с diff-подтверждением

```typescript
async function writeFileWithDiff(
    path: string,
    newContent: string,
    requireApproval: boolean = true
): Promise<void> {
    if (requireApproval) {
        // Открыть diff view для подтверждения пользователем
        const originalUri = vscode.Uri.file(path);
        const modifiedUri = await createTempFile(newContent);
        await vscode.commands.executeCommand(
            'vscode.diff', originalUri, modifiedUri,
            `AI Agent: изменения в ${path}`
        );
        const approved = await askUserApproval();
        if (!approved) return;
    }
    const uri = vscode.Uri.file(path);
    await vscode.workspace.fs.writeFile(
        uri, Buffer.from(newContent, 'utf8')
    );
}
```

### Поиск файлов по паттерну

```typescript
async function findFiles(
    include: string,
    exclude: string = '**/node_modules/**'
): Promise<string[]> {
    const uris = await vscode.workspace.findFiles(include, exclude);
    return uris.map(u => u.fsPath);
}

// Пример: найти все Python файлы
const files = await findFiles('**/*.py');
```

---

## Terminal API

### Создание и управление терминалом

```typescript
// extension/src/terminal-manager.ts
class TerminalManager {
    private terminals = new Map<string, vscode.Terminal>();

    createTerminal(name: string, cwd: string): vscode.Terminal {
        const terminal = vscode.window.createTerminal({
            name,
            cwd,
            env: { AI_AGENT_SESSION: '1' }
        });
        this.terminals.set(name, terminal);
        terminal.show();
        return terminal;
    }

    async executeCommand(
        terminalName: string,
        command: string
    ): Promise<void> {
        const terminal = this.terminals.get(terminalName)
            ?? this.createTerminal(terminalName, workspace.rootPath);
        terminal.sendText(command);
    }
}
```

### Захват вывода терминала

Прямой захват вывода в VS Code API ограничен. Рекомендуемый паттерн — использование PTY через расширение или запись в файл:

```typescript
// Вариант 1: через shell integration (VS Code 1.93+)
terminal.shellIntegration?.executeCommand(command);

// Вариант 2: через временный файл
const outputFile = `/tmp/agent_output_${Date.now()}.txt`;
terminal.sendText(`${command} 2>&1 | tee ${outputFile}`);
await watchFileForCompletion(outputFile);
const output = await readFile(outputFile);
```

---

## Language Intelligence

### Получение символов документа

```typescript
// Получить все функции/классы в файле
async function getDocumentSymbols(
    filePath: string
): Promise<vscode.DocumentSymbol[]> {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    return await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider', uri
    ) ?? [];
}
```

Результат — дерево символов:

```json
[
  {
    "name": "MemoryManager",
    "kind": "Class",
    "range": {"start": {"line": 42}, "end": {"line": 180}},
    "children": [
      {"name": "__init__", "kind": "Method"},
      {"name": "process_message", "kind": "Method"},
      {"name": "get_relevant_context", "kind": "Method"}
    ]
  }
]
```

### Диагностика (ошибки и предупреждения)

```typescript
async function getDiagnostics(filePath: string): Promise<DiagnosticInfo[]> {
    const uri = vscode.Uri.file(filePath);
    const diagnostics = vscode.languages.getDiagnostics(uri);
    return diagnostics
        .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
        .map(d => ({
            line: d.range.start.line + 1,
            message: d.message,
            source: d.source,
            code: d.code?.toString()
        }));
}
```

### Поиск определений и ссылок

```typescript
// Перейти к определению символа
const definitions = await vscode.commands.executeCommand(
    'vscode.executeDefinitionProvider',
    uri, position
);

// Найти все использования
const references = await vscode.commands.executeCommand(
    'vscode.executeReferenceProvider',
    uri, position, { includeDeclaration: true }
);
```

---

## Workspace Analysis

### Полный анализ структуры проекта

```typescript
// extension/src/workspace-analyzer.ts
interface ProjectStructure {
    rootPath: string;
    languages: string[];
    frameworks: string[];
    entryPoints: string[];
    testFiles: string[];
    configFiles: string[];
    totalFiles: number;
}

async function analyzeWorkspace(): Promise<ProjectStructure> {
    const [pyFiles, tsFiles, jsFiles] = await Promise.all([
        vscode.workspace.findFiles('**/*.py', '**/node_modules/**'),
        vscode.workspace.findFiles('**/*.ts', '**/node_modules/**'),
        vscode.workspace.findFiles('**/*.js', '**/node_modules/**'),
    ]);

    const configFiles = await vscode.workspace.findFiles(
        '{package.json,pyproject.toml,Cargo.toml,go.mod,*.config.ts}',
        '**/node_modules/**'
    );

    return {
        rootPath: vscode.workspace.rootPath ?? '',
        languages: detectLanguages([pyFiles, tsFiles, jsFiles]),
        frameworks: await detectFrameworks(configFiles),
        entryPoints: detectEntryPoints(pyFiles, tsFiles),
        testFiles: filterTestFiles([...pyFiles, ...tsFiles]),
        configFiles: configFiles.map(u => u.fsPath),
        totalFiles: pyFiles.length + tsFiles.length + jsFiles.length,
    };
}
```

---

## Потоки данных

### Пользователь отправляет запрос

```
1. Пользователь вводит в Chat Panel (WebView)
2. Extension ──POST /api/agent/message──► Backend
3. Backend: Research Phase → анализ workspace через Extension API
   ├── Backend ──POST /api/vscode/find-files──► Extension
   ├── Backend ──POST /api/vscode/read-file──► Extension (релевантные файлы)
   └── Backend ──POST /api/vscode/get-symbols──► Extension
4. Backend: Execution Phase
   ├── Backend ──POST /api/vscode/write-file──► Extension (с diff approval)
   └── Backend ──POST /api/vscode/run-command──► Extension (npm test, etc.)
5. Backend ──WebSocket streaming──► Extension ──► Chat Panel
```

### Агент редактирует файл

```
Agent ──► write_file(path, content)
            │
            ▼
        Extension показывает diff в VS Code
            │
            ▼
        Пользователь нажимает "Принять" / "Отклонить"
            │
            ▼
        [Принято] → vscode.workspace.fs.writeFile()
        [Отклонено] → операция отменена, агент получает отказ
```

---

## Конфигурация

Настройки в `settings.json` VS Code:

```json
{
  "aiCompanion.enabled": true,
  "aiCompanion.backendUrl": "http://localhost:8000",
  "aiCompanion.requireApprovalForFileChanges": true,
  "aiCompanion.requireApprovalForCommands": true,
  "aiCompanion.maxFileSizeKB": 512,
  "aiCompanion.excludePatterns": [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/__pycache__/**"
  ],
  "aiCompanion.autoIndexWorkspace": true,
  "aiCompanion.indexUpdateIntervalSec": 30
}
```

---

## Безопасность

### Принципы

1. **Обязательное подтверждение**: все изменения файлов и исполнение команд требуют явного approve от пользователя (если не отключено)
2. **Ограничение области**: агент работает только внутри `workspaceRoot`, выход за пределы заблокирован
3. **Аудит действий**: все операции логируются в Output Channel "AI Agent"
4. **Санитизация команд**: `rm -rf`, `format`, `sudo` и другие деструктивные команды требуют дополнительного подтверждения

### Аудит лог

```
[AI Agent] 2026-03-31T13:00:00Z READ  src/auth/jwt.py (4.2 KB)
[AI Agent] 2026-03-31T13:00:05Z WRITE src/auth/jwt.py (APPROVED by user)
[AI Agent] 2026-03-31T13:00:10Z CMD   "npm test" (APPROVED by user)
[AI Agent] 2026-03-31T13:00:15Z CMD   "rm -rf dist/" (DENIED by user)
```

---

## Связанные разделы

- [Терминальные навыки](../terminal-skills/README.md) — детальная документация по выполнению команд
- [Протокол исследования](../research-protocol/README.md) — как агент использует файловую систему для разведки
- [Ядро оркестратора](../orchestrator-core/README.md) — координация доступа к VS Code API

---

*Версия: 1.0.0 | Зависимости: VS Code Extension API 1.85+*
