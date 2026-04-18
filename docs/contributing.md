# Como contribuir

## Fluxo de trabalho

1. Cria um branch a partir de `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feat/nome-da-feature
   ```

2. Faz as alterações e commita com mensagens claras:
   ```bash
   git add .
   git commit -m "feat(scanner): integrar Shodan API com cache Redis"
   ```

   Prefixos: `feat` `fix` `chore` `docs` `test` `refactor`

3. Abre um Pull Request para `develop`.

4. `main` só recebe merges de `develop` após todos os testes passarem.

## Convenções de commit

```
tipo(âmbito): descrição curta em minúsculas

Corpo opcional explicando o porquê, não o quê.

Refs: #issue-number
```

## Antes de fazer PR

- [ ] `pnpm check` passa sem erros
- [ ] `pnpm test` passa
- [ ] Nenhuma variável de ambiente hardcoded
- [ ] Sem `console.log` de debug esquecidos
