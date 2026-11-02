# BGCT 0.6.0 — kit de internacionalização da extensão (STAGING)

Estado: candidato isolado, **não integrado à extensão real** e **não publicado**. Criado a partir do registro histórico `BGCT_TRANSLATOR_CURRENT.txt` (trechos de `updateLiveCaptionStatus`) e `BGCT_GATE09A_STORE_AUDIT.txt` (manifest V3 0.6.0, ausência de `default_locale`).

## O que já existe

- `_locales/en/messages.json`, `_locales/pt_BR/messages.json`, `_locales/es/messages.json`: estrutura válida de mensagens de extensões Chromium, com parâmetros localizados.
- `catalogs.js` e `locale-core.js`: helpers clássicos sem acesso à rede, com fallback EN, prioridade de escolha manual, suporte ao `chrome.storage.local` por injeção, localização dos estados observados e formatação do progresso.
- `tools/check-extension-i18n.mjs`: testes de chave, estado, tradução, placeholder, fallback e persistência.
- `extension-staging/README.md`: contrato de integração para a fonte original.

## Orientações para integração segura (APENAS após obter a fonte completa)

1. Identificar o `manifest.json` real e preservar TODAS as permissões e os content scripts aprovados. Adicionar `"default_locale": "en"`; referenciar o nome e a descrição `"__MSG_extensionName__"` e `"__MSG_extensionDescription__"`. Mover as três pastas `_locales` para a raiz da extensão. Não substituir o manifesto inteiro por modelo fictício.
2. Revisar todas as strings do `popup.html`, `popup.js`, `content.js`, `content.css` e mensagens dinâmicas. As strings preparadas são ponto de partida, não prova de cobertura integral.
3. Injetar `catalogs.js` **antes** de `locale-core.js` antes do código que as usa, apenas depois de entender a ordem real dos scripts de conteúdo e do popup. Se houver CSP/empacotamento próprio, adaptar à implementação real; não injetar remotamente.
4. Separar idioma da **interface** (`bgctUiLocale`) do idioma **alvo da tradução** (preferência existente) e do idioma **fonte**. Não alterar o contrato da tradução nem o cache para instalar i18n visual.
5. A preferência manual deve prevalecer sobre a detecção. `getSaved(chrome.storage.local)` e `save(chrome.storage.local, "pt-BR")` são auxiliares; o estado da interface deve reagir à escolha e persistir.
6. Estados reais já identificados: `api-unavailable`, `pair-unavailable`, `downloading`, `loading`, `translating`, `error`, `ready`, fallback preparando. Preservar seus significados; não transformar ausência de API em anúncio de tradução pronta.
7. Verificar Chrome/Edge reais, Udemy/curso autorizado e fullscreen. **Não há testes de produto real nesta branch**. A ausência de `default_locale` está verificada em auditoria histórica, mas NÃO é prova de que a instalação atual esteja igual.

## Documentação oficial

- Chrome i18n: https://developer.chrome.com/docs/extensions/reference/api/i18n
- Edge store localization: https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- Evitar confusão: a UI da extensão suporta idioma detectado; selecionar manualmente idioma distinto exige runtime próprio — `chrome.i18n.getMessage` sozinho segue idioma do navegador.

## Bloqueio

O código principal de `E:\BlackGold_Course_Translator\01_EXTENSION` não foi encontrado entre os 18 repositórios visíveis via GitHub. Este kit não edita esse código e não transforma o site em extensão funcional. O pacote RC1 histórico possui SHA-256 `f7ce5acd03fdb059d919b896dfe760d64402ef47173ce5e0506b509393148f49`; valor apenas para identificar o original ao recuperá-lo, não SHA deste kit.
