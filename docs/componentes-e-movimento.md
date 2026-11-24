# Componentes e movimento

Implementação em 14/11/2026, adaptada à interface existente do SysReview.

| Recurso | Aplicação |
| --- | --- |
| Menu dropdown | Menus de aparência e últimas decisões no detalhe do artigo; abertura e saída com opacidade, escala e deslocamento discreto. |
| Modal open/close | Casca compartilhada dos modais e seletores de critérios; detalhe do artigo mantém seu gesto móvel de fechamento. |
| [Rubber Segment](https://reactbits.dev/micro/rubber-segment) | Seletor de busca, navegação principal (incluindo Estatísticas/Sobre) e abas do artigo. Substitui todas as aplicações de Tabs sliding. O seletor de busca permite arraste; a navegação e as abas preservam os botões e atalhos existentes, com o mesmo efeito de esticar e acomodar o destaque. |
| Rubber Segment em Estatísticas | Abas Panorama Geral / Processo de Seleção / Redes Bibliométricas; gráfico / mapa de países / continentes; tipo de rede, contagem, visualização e posição do rótulo. Filtros de bases, etapas e critérios mantêm seleção múltipla com destaques elásticos independentes. |
| Warm Tooltip | Botões com dicas no cabeçalho, protocolo, tabelas e detalhe do artigo. Primeiro hover espera 400 ms; dicas seguintes do grupo abrem imediatamente durante a janela de 300 ms. Foco pelo teclado abre imediatamente. |
| Dropdown menu morph | Menu Arquivo, com transformação da superfície do botão em painel. |
| Spring Check | Critérios do artigo e idiomas/bases do protocolo, com `strike="none"`: o texto permanece sem risco. |
| [Spotlight Card](https://reactbits.dev/c/components/spotlight-card) | Os seis cartões de Sobre recebem iluminação índigo que acompanha o ponteiro, com borda iluminada e paleta adaptada ao tema. O link do autor mantém foco por teclado; o efeito respeita movimento reduzido e desaparece ao encerrar o toque. |

Os componentes ficam em `src/components/motion/`. A única dependência adicionada é `motion`. A implementação mantém inputs nativos, estados do projeto e traduções existentes. As animações respeitam `prefers-reduced-motion`; o menu Arquivo aceita setas, Home, End e Escape. Os modais mantêm contenção e restauração de foco, e painéis em saída deixam de aceitar interação.

Referências: [Menu dropdown](https://transitions.dev/detail.html?t=menu-dropdown), [Modal open/close](https://transitions.dev/detail.html?t=modal-open-close), [Rubber Segment](https://reactbits.dev/micro/rubber-segment), [Dropdown menu morph](https://transitions.dev/detail.html?t=dropdown-menu-morph), [Warm Tooltip](https://reactbits.dev/micro/warm-tooltip) e [Spring Check](https://reactbits.dev/micro/spring-check). Os avisos de licença foram preservados em `public/licenses/`.

## Validação

- `npm test`: 78 testes aprovados.
- `npm run build`: concluído; permanecem os avisos sobre tamanho do bundle e importação de ExcelJS.
- Verificação no navegador: 25 verificações aprovadas em cada cenário — desktop 1440 px, português, tema claro, movimento normal; celular 390 px, inglês, tema escuro, movimento reduzido. Inclui foco, teclado, janela dos tooltips, checkbox, limites do dropdown e fechamento dos modais.
- Revisão visual do menu Arquivo e do detalhe do artigo em desktop e celular.
- Comparação de lint dos arquivos alterados com `HEAD`: 31 erros preexistentes, nenhum erro adicional. Novos componentes sem erros de lint.
- `git diff --check` sem problemas nos arquivos alterados desta implementação.

Os relatórios e capturas locais ficam em `.local/motion-qa/` (diretório ignorado pelo Git). As verificações usam um perfil de navegador isolado e dados de exemplo.

Estatísticas: 16 verificações aprovadas em cada cenário (desktop claro/PT e celular escuro/EN com movimento reduzido), incluindo troca de abas, persistência do destaque após atualização dos gráficos, filtros simultâneos e os quatro seletores de redes. Build aprovado e nenhum erro adicional no comparativo de lint.
