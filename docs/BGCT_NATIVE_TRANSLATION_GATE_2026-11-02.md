# BGCT — Gate de tradução nativa (02/11/2026)

Status: **PENDENTE DE COMPROVAÇÃO**. Documento técnico interno; não é autorização de release.

## Evidência confirmada
- Commit `32a164807e05c6f5c228cf34be5ce73f6f01b744`.
- Chrome for Testing com extensão MV3 candidata, HTTPS sintético local, perfil temporário.
- `Translator.availability()` retornou `downloadable` para en→pt, en→es, es→pt, pt→en.
- Testes do navegador, auditorias e pacote interno passaram.
- A tradução com modelo real NÃO foi executada. O teste do fluxo de tradução usa um mock.
- Nenhum download de modelo foi iniciado por esses testes.

## Precisão sobre downloadable
A documentação oficial do Chrome esclarece que a API pode **ocultar a instalação de pacotes por par/por origem**: a disponibilidade anunciada como `downloadable` não comprova, de forma isolada, a ausência física de pacotes no host. O correto é afirmar apenas que **a disponibilidade observada nesta origem foi downloadable**.

Fonte: https://developer.chrome.com/docs/ai/translator-api

## Gate real separado
1. Preservar todos os checks atuais sem download.
2. Preparar uma prova explícita em ambiente descartável e autorizado, com ativação de usuário, para `Translator.create()` e `translate()` realmente executados. Qualquer download de pacote deve ocorrer somente nessa prova opt-in, nunca nos workflows automáticos padrão.
3. Confirmar texto de saída não vazio, progresso/erros, destruição da sessão e evidência de log sem incluir dados de usuários.
4. Confirmar execução na extensão MV3 real e depois em aula real da Udemy, com permissão adequada.
5. Comparar com a extensão original 0.6.0 antes de qualquer decisão de merge/release.

**Não fazer:** declarar modelo nativo traduzindo, Udemy comprovada ou paridade com 0.6.0 baseado somente em smoke sintético.

PR #1 segue DRAFT / NÃO MESCLAR / NÃO PUBLICAR; main e versão 0.6.0 ficam intactas.
