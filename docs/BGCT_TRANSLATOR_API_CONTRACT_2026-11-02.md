# BGCT Browser Translator API — runtime staged, not integrated
Date: 2026-11-02. Source status: `E:\BlackGold_Course_Translator\01_EXTENSION` is not present in connected GitHub repositories. The actual 0.6.0 RC1 remains unchanged.

## Technical implementation produced
- `translator-api-adapter.js` is a classic IIFE, with injected `TranslatorCtor` for verifiable tests, no backend and no remote service.
- `inspect(source,target)` probes `Translator.availability` without downloading a language model.
- `startFromGesture()` invokes `Translator.create` synchronously, before the first async suspension; **it MUST be directly called in an actual click handler**, not from an automatic page load or `setTimeout`. All prepare work must be performed ahead of the click.
- `downloadprogress` maps `loaded` 0..1 to 0..100 and informs UI.
- `translate` returns structured success/error and rejects stale results after a lesson/language change; `reset` releases a previous translation session.
- Invalid language pairs, browser missing API, unavailable/downloadable/downloading model, create failures and translate failures all have defined statuses.
- Text translation only. NO integration with Udemy selectors, DOM, caption matching, user storage or actual extension UI is implied.
- Status `needs-activation` is localized in PT-BR/EN/ES with helper support.

## User-visible safeguards
Never claim the translation is ready before the local model is created. Never start a model download on passive page load. Do not promise mobile browser extension support. The browser supports models/translation pairs conditional on environment and version. A course must supply authorized captions/transcript.

## Evidence and references
- Chrome Translator API: https://developer.chrome.com/docs/ai/translator-api
- Microsoft Edge Translator API: https://learn.microsoft.com/en-us/microsoft-edge/web-platform/translator-api
- Historical source excerpt file: BGCT_TRANSLATOR_CURRENT.txt, `updateLiveCaptionStatus` strings.
- Historical RC1 audit: BGCT_GATE09A_STORE_AUDIT.txt, commit c29010f1aabfc15124b3d05889338cf772a576fd; SHA256 f7ce5acd03fdb059d919b896dfe760d64402ef47173ce5e0506b509393148f49.

## Remains blocked
Full original extension source, real Chrome/Edge tests, actual Udemy caption integration, preservation of old feature set, release and approval. No merge/deploy in this staging step.

## Correção adicional — disputas assíncronas entre legendas
- Mesmo dentro da mesma aula, cada chamada `translate()` incrementa um número sequencial. Somente o resultado da chamada mais recente pode ser considerado atual, inclusive quando uma tradução anterior falha depois de uma nova ter terminado.
- Uma legenda vazia também invalida o resultado anterior. `reset` e nova consulta de disponibilidade invalidam pedidos em andamento.
- Progresso de download atrasado não regride a interface de `ready` para `downloading`; eventos sem valor numérico não são convertidos indevidamente em 0%.
- Testes simulados em `tools/check-translator-api.mjs` cobrem conclusão fora de ordem, erro obsoleto, legenda vazia, troca de idioma e progresso atrasado.
- Este módulo permanece isolado. Ainda falta integração no `content.js` original e teste com aula real.

## 2026-11-02 — cancelamento de tradução obsoleta e coordenador de legendas
- Documentação oficial: Chrome processa traduções sequencialmente; não basta apenas rejeitar o resultado antigo. O módulo de tradução preparado agora repassa um AbortSignal a translate() quando disponível e cancela o segmento anterior ao receber um novo segmento. O fallback por sequence ID permanece para APIs que não respeitam AbortSignal. Fonte: https://developer.chrome.com/docs/ai/translator-api
- Edge documenta AbortController para interromper traduções e sessões. O progresso do modelo aceita event.loaded/event.total ou event.loaded (fração). Fonte: https://learn.microsoft.com/en-us/microsoft-edge/web-platform/translator-api
- Um novo caption-coordinator.js guarda em memória (nunca envia ao servidor) um cache LRU limitado de traduções por curso, aula, idiomas, cue ID, timestamp e texto. Deduplica requisições idênticas, evita exibir o texto original enquanto traduz, suprime respostas atrasadas, limpa a legenda ao mudar de aula e sinaliza falhas sem deixar o texto vazio silenciosamente.
- A mudança de aula com o mesmo par de idiomas preserva a sessão local já carregada; a troca de par de idiomas precisa resetar a sessão.
- Ferramentas de QA: check-translator-api.mjs e check-caption-coordinator.mjs, executadas no GitHub Actions (simulações, não navegador real).
- **Sem integração com a extensão instalada**: só módulos preparados; não afirmar que a sincronização de Udemy foi consertada. É necessário revisar selectors e contrato de cue reais no content.js original.


## Cancelamento de criação do modelo (02/11/2026)
- `Translator.create()` recebe um `AbortSignal` disponível. Ao executar reset ou trocar o par de idiomas, o módulo cancela a criação/download em andamento. O modelo criado é destruído com `destroy()`; os pedidos atrasados continuam protegidos pelo identificador de geração.
- `cancelPending()` cancela apenas a tradução atual sem descartar o modelo. O sinal da sessão não é cancelado a cada legenda.
- Testes simulados de cancelamento da criação e liberação do modelo incluídos; não comprova compatibilidade da extensão real.
- Fontes: https://developer.mozilla.org/en-US/docs/Web/API/Translator/create_static ; https://learn.microsoft.com/en-us/microsoft-edge/web-platform/translator-api .


## 2026-11-02 — privacidade e integração de contratos de legendas
- Detectado risco lógico na versão de staging: ao alternar entre cursos, as traduções anteriores permaneciam no cache local, embora a chave impedisse sua reutilização acidental. Agora o cache é apagado quando o curso ou par de idiomas muda.
- Contexto inválido limpa a identidade do curso anterior, descarta traduções pendentes e bloqueia renderização obsoleta.
- Nova função `close()` encerra a sessão, apaga cache e contexto, impede retorno de texto antigo após fechar o painel.
- Testes `check-caption-coordinator.mjs` cobrem limpeza ao trocar de curso, contexto inválido, resultados atrasados e fechamento.
- Novo `check-staging-integration.mjs` exercita **juntos** o adapter Translator e coordenador: modelo, legendas concorrentes, troca de aula, troca de idioma, cache e liberação. São simulações, **não testes em aula real**.


## 2026-11-02 — tradução vazia não pode ser sucesso
- Falha concreta no contrato da branch: `Translator.translate()` podia retornar espaços/vazio para uma frase não vazia e ser marcado como traduzido. O usuário via uma legenda em branco sem aviso, e o coordenador podia gravar esse resultado no cache.
- O adaptador passa a devolver `{ok:false,code:"empty-output"}` e estado `error` quando a API devolve texto vazio/branco para uma entrada não vazia. Frases vazias de origem continuam representando `no-caption` normalmente.
- O coordenador bloqueia o cache de resultados vazios mesmo quando o runtime não aplica a verificação. Falhas não ficam memorizadas como resposta definitiva: repetir a mesma legenda depois de recuperar o modelo tenta novamente.
- Testes dedicados nos dois módulos e no teste conjunto verificam erro visível, ausência de cache e recuperação após nova tentativa.
- Esse caso foi validado por mocks no GitHub Actions, NÃO pela extensão 0.6.0 instalada.


## 2026-11-02 — diferenciação entre legendas ausentes e dados inválidos
- BUG no coordenador em staging: um evento sem `text` de tipo `string` era tratado como texto vazio legítimo e escondia erros na leitura do DOM de legendas.
- Agora `showCue(null)` ou objetos sem `text` textual devolvem `invalid-cue` e exibem estado de erro, descartando a requisição anterior. Um `text: ""` legítimo continua sendo `no-caption`.
- Outro bug: resposta `stale` do runtime, quando não há legenda mais recente, deixava a promise anterior memorizada, bloqueando uma nova tentativa. Agora a resposta antiga é liberada e a tentativa seguinte pode prosseguir; a falha é explicitada como `stale-translation`.
- Testes: evento de legenda com texto ausente, resultado obsoleto, legenda genuinamente vazia e nova tentativa após cancelamento, todos cobertos por `tools/check-caption-coordinator.mjs`.
- Nota: testes na branch staging com simulação do runtime, sem prova de compatibilidade com a extensão 0.6.0 instalada.


## 2026-11-02 — mensagens localizadas para erros de legenda
- `_locales/en`, `pt_BR` e `es` agora incluem mensagens para `invalid-cue`, `stale-translation`, `empty-output`, ausência de identificação da aula e modelo ainda não pronto.
- `locale-core.js` fornece `captionError(reason, locale)`, com fallback seguro para erro genérico quando o código não é conhecido. `catalogs.js` acompanha as mesmas strings para permitir escolha manual de idioma da interface.
- Testes cobrem os códigos nos três idiomas e fallback. Não foi alterada a preferência do idioma-alvo da tradução; a internacionalização é da UI.
- Integração na interface real da extensão ainda depende de recuperar a fonte original. Não confundir sucesso do staging com um novo release.
