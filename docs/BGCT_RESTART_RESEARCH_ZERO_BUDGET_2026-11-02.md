# BlackGold Course Translator — contrato de retomada e aquisição orgânica R$ 0
Data: 2026-11-02
Status: ESTUDO VERIFICADO / IMPLEMENTAÇÃO PENDENTE
Fonte: decisão do titular em 02/11/2026 e norma BLACKGOLD ECOSYSTEM BGECO-GOV-V2.13 (26/10/2026).
Escopo: TRADUTOR; site exclusivo apenas depois de corrigir a extensão. NÃO é o portal de todos os ativos.
Branch de trabalho: work/bgct-restart-zero-budget-i18n-20261102
Este documento não aprova release, monetização, nome novo, mudança visual ou deploy.

## Situação confirmada

- Repositório do site: ProjetosCosaNostra/blackgold-course-translator-site, base main 0d23df6878a06f13cf2978b244e49c80d63120ee (2026-10-03). Contém index.html, privacy.html, support.html e assets/site.css. Home, privacidade e suporte estão em PT-BR com strings embutidas. CSS já possui media queries para 980px e 760px, mas responsividade real ainda precisa de validação.
- Código-fonte do tradutor não foi localizado nos repositórios da conta conectada; não afirmar correções feitas na extensão.
- Auditoria anterior BGCT_GATE09A_STORE_AUDIT.txt: extensão Chromium Manifest V3 0.6.0; branch local work/gate08e-packaged-smoke-pass; commit c29010f1aabfc15124b3d05889338cf772a576fd; RC1 SHA256 f7ce5acd03fdb059d919b896dfe760d64402ef47173ce5e0506b509393148f49. Injeção limitada a https://*.udemy.com/course/*/learn/*, storage/activeTab, default_locale ausente. Auditoria não encontrou documentos de store no repositório local naquela data; o REPOSITÓRIO DO SITE já contém privacy.html, portanto não declarar inexistência global de política de privacidade.
- Regras normativas: PT-BR/EN/ES desde a base, detectar idioma/localidade, permitir escolha manual persistente, fallback EN. Botão Ecossistema abre navegação própria e resolve destinos oficiais pelo manifesto canônico versionado; não transformar botão em redirecionamento para loja. Manifesto público canônico ainda não definido na norma, portanto NÃO inventar endpoint nem lista permanente paralela. Não publicar como ACTIVE sem evidência.

## Sequência de implementação

### A. Corrigir a extensão PRIMEIRO (fonte necessária: E:\BlackGold_Course_Translator\01_EXTENSION + baseline local)
1. Inspecionar a implementação atual real, comparar com RC1, preservar baseline limpa.
2. Reproduzir problemas e corrigir pelo código-base, não por remendos acumulativos.
3. Verificar detecção de idioma, disponibilidade do par de tradução, primeiro download do modelo, estados de falha, sincronização de transcrição/legenda, cache, troca de aulas, tela cheia, glossário técnico, reabrir painel e evitar legendas vazias silenciosas. Itens são ALVOS DE VERIFICAÇÃO, não bugs confirmados.
4. Implementar i18n da UI da extensão (manifest.default_locale, _locales, popup, painel, mensagens, diagnósticos/erros pertinentes), PT-BR/EN/ES com fallback EN e preferência persistente; separar idioma da interface, idioma original e idioma-alvo.
5. Verificar suporte por navegador e versão, pares de idioma e hardware. Chrome Translator API: desktop Chrome 138+; Edge: desktop Edge 148+ segundo docs publicadas. NÃO prometer extensão móvel. Modelos locais podem precisar de download.
6. Verificar permissões mínimas, política de privacidade e páginas de loja; publicar apenas após aprovação real e evidência.

### B. Site próprio DEPOIS da extensão
- Preservar identidade aprovada; não supor nome novo; não modificar site publicado antes da aprovação.
- Site mobile-first acessível; testar 390/900/901/1280px e teclado, contraste, links e toque >=44px.
- Internacionalização de base: rotas indexáveis /pt-br/, /en/, /es/; recursos traduzidos para home, ajuda, suporte, política e metadados. Seleção manual persistente, detecção de preferência sem impedir rastreamento, fallback EN.
- URLs canônicas localizadas, hreflang recíproco, x-default, sitemap.xml, robots.txt, títulos/descrições naturais, Open Graph, páginas de FAQ e instruções de instalação por navegador.
- Não traduzir nomes de marca ou falsificar capacidades do produto. Distinguir site responsivo em celular da extensão desktop.
- Botão Ecossistema visível, com tela própria; resolver links pelo manifesto oficial apenas quando locator for validado. Enquanto pendente: marcar integração como em construção, sem CTA comercial falso.
- CTAs: instalar quando houver listagem real aprovada; caso contrário apresentar estado correto e caminho de suporte. Nunca simular loja nem usar link inventado.

### C. Aquisição orgânica automatizável, orçamento estrito R$ 0
1. PRIMEIRO: Microsoft Edge Add-ons — registro de desenvolvedor GRATUITO; submissão somente após tradutor estar funcional, atendendo requisitos da loja. Fonte: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/create-dev-account
2. Chrome Web Store: requer taxa única de registro — NÃO é dependência do primeiro lançamento com orçamento zero, salvo conta já cadastrada. Fonte: https://developer.chrome.com/docs/webstore/register
3. Cloudflare Pages Free: deploy automático a partir do GitHub; 500 builds/mês no Free. Sem domínio pago, usar subdomínio .pages.dev somente quando efetivamente provisionado e confirmado. Fonte: https://developers.cloudflare.com/pages/platform/limits/ e https://developers.cloudflare.com/pages/configuration/git-integration/
4. GitHub Actions no repositório público: validar conteúdo, gerar páginas estáticas, sitemap/robots, RSS, notas de versões reais, link checks; commit/release dispara pipeline. Atenção: workflows agendados em repositórios públicos podem ser desativados após 60 dias sem atividade. Fontes: https://github.com/pricing e https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
5. Google Search Console: verificar propriedade uma única vez, disponibilizar sitemap.xml; indexação NÃO é garantida. Google recomenda URLs por idioma e hreflang. Fontes: https://developers.google.com/search/docs/specialty/international/localized-versions e https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
6. Bing Webmaster Tools + IndexNow: gerar chave, hospedar arquivo de verificação, notificar apenas URLs novas/alteradas, após verificação de domínio. Fonte: https://www.bing.com/webmasters/help/URL-Submission-62f2860b
7. Web Analytics gratuito do Cloudflare com privacidade e revisão de obrigações legais/consentimento. Fonte: https://developers.cloudflare.com/pages/how-to/web-analytics/
8. Conteúdo orgânico útil e enxuto: demonstração própria com legendas fictícias/licenciadas; guias PT/EN/ES sobre traduzir legendas de curso, configuração de navegador/modelo local, compatibilidade e solução de erros. Criar somente páginas com utilidade genuína. Proibido publicar em massa textos vazios ou usar spam/SEO manipulativo. Fonte: https://developers.google.com/search/docs/essentials/spam-policies
9. Redes sociais: não usar bots não autorizados nem prometer autopost universal. API oficial do Instagram exige conta Professional e permissões; publicar só se integrações forem autorizadas e conteúdo tiver origem comprovada. Reddit/comunidades exigem participação relevante, não propaganda automatizada. YouTube API exige configuração e pode ter requisitos de verificação. Canais secundários, NÃO dependência.
10. Medir somente o essencial: visitas orgânicas por idioma, visitas à página de instalação, instalações reais se a loja disponibilizar métricas, erros reportados, receita real caso monetização seja aprovada. Não afirmar conversão só por cliques.

### Regras de publicação e crescimento
- Evitar anúncios pagos, domínios pagos, serviços de tradução remota pagos, SaaS de posts pagos e ferramentas IA pagas.
- Automatização É: entregas reais, indexação técnica, feeds, publicação de notas de release aprovadas, monitoramento, manutenção. NÃO significa geração automática de consumidores; o tráfego depende de indexação, demanda e valor real do produto.
- Não divulgar um produto development/preview como pronto. Respeitar promotion_allowed/indexing_allowed da norma e registrar evidências de release.
- Não copiar transcrições, imagens ou aulas da Udemy para divulgação sem direito de uso; não contornar DRM/autenticação.
- Proteger dados pessoais, chaves de API e credenciais; segredos fora do repo público.

## Estado de entrega neste commit
- Concluído: auditoria inicial do site no GitHub; consulta à auditoria histórica da extensão; estudo de canais e documentação oficial; definição da arquitetura de custo zero.
- Não concluído: correção da extensão; i18n na extensão e no site; implementação do manifesto; integração/contas de buscadores e lojas; deploy final; automações de marketing; validação mobile real.
- Esta branch contém somente o estudo; nenhuma página de produção alterada.
