# Mansoni Ruflo Helper Runtime Bootstrap

- Если `.claude/settings.json` содержит hooks на `.claude/helpers/*`, проверять существование `hook-handler.cjs`, `auto-memory-hook.mjs`, `statusline.cjs` до любых выводов о работе runtime.
- Пустая `.claude/helpers/` означает, что hooks lifecycle формально включён, но фактически не работает.
- Минимальный рабочий bootstrap должен создавать `memories/session/swarm/{state,findings,decisions,blockers}.md` и поддерживать namespace `mansoni-swarm`.
- Для гибрида Ruflo Inside Mansoni canonical entrypoint остаётся `mansoni`, а helper runtime должен отражать это в session state.