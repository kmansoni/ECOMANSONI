# Mansoni Auto Bash Evidence And Skeptical Review

- `post-bash` hook теперь может автоматически писать evidence для распознаваемых verification-команд: `tsc`, `lint`, `vitest`, `playwright`.
- Auto evidence предназначен для уменьшения ручных шагов, но verification gate всё равно остаётся fail-closed: без нужных evidence PASS не выдаётся.
- Добавлен skill `skeptical-review`: он не дублирует code review, а проверяет claims о fix, tests, build, review и verify на предмет реальных подтверждений.
- `review-toolkit`, `review.prompt.md` и `debug.prompt.md` теперь умеют использовать skeptical-review как отдельный слой доказательного аудита.