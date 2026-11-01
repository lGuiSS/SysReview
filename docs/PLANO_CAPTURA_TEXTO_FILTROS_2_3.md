# Plano: texto completo para os Filtros 2 e 3 com IA

Data: 31/10/2026  
Status: plano definitivo; implementação ainda não iniciada. Substitui `PLANO_TEXTO_COMPLETO_E_PDF.md` e `PLANO_TRIAGEM_ASSISTIDA.md`.

## 1. Objetivo

Permitir que o usuário insira o texto dos trabalhos, ou que o app o capture automaticamente, para que a **Seleção assistida por IA** funcione nos Filtros 2 e 3, e não só no Filtro 1 (título, resumo e palavras-chave).

## 2. Como está hoje

A avaliação já está **pronta para receber texto completo**. Falta só alguém preencher esse texto:

- `src/ai/screening.js`: `buildState` já envia `introduction` e `conclusion` no Filtro 2, e as 5 seções (`introduction`, `methods`, `results`, `discussion`, `conclusion`) no Filtro 3. As perguntas de qualidade já existem só no Filtro 3.
- `src/ai/evaluationController.js`: `articleText` lê `article.fullText.sections`. Os hashes (`textHash`, `inputHash`) já marcam sugestões como desatualizadas quando o texto muda.
- `src/App.jsx`: na importação (BibTeX e MEDLINE), `fullText` sempre nasce como `null`, e nenhuma tela permite preenchê-lo. Por isso os Filtros 2 e 3 sempre retornam `needs-text`.
- `src/ai/answerContract.js`: no ChatGPT, a evidência citada precisa existir no texto enviado. Com o texto completo, essa regra passa a ser uma auditoria útil, sem nada a mudar.

Problemas que vão aparecer:

- O auto-save grava tudo no `localStorage` (`src/fileSystem.js`, `setupAutoSave`), que tem limite de cerca de 5 MB. Com textos completos (300 artigos × ~60 KB), ele vai falhar sem avisar.
- O servidor local aceita no máximo 2 MB por requisição (`server/chatgptServer.js`, `jsonBody`).
- O Jev aceita até 32k tokens por estado + pergunta.
- `hasEnoughText` aceita qualquer seção preenchida, o que é fraco para o Filtro 3.

Confirmar esses pontos novamente antes da implementação, pois o projeto pode mudar.

## 3. Três formas de obter o texto

| Forma | Para quem | Como funciona |
| --- | --- | --- |
| **A. Colar texto** | Qualquer artigo, sem ferramenta externa | Um campo para o texto inteiro, ou um campo por seção |
| **B. Importar PDF** (um ou vários) | O usuário já baixou os PDFs (Zotero, Mendeley, portal da CAPES) | Extração no navegador; em lote, cada PDF é ligado ao seu artigo automaticamente |
| **C. Busca automática em acesso aberto** | Artigos com DOI | Consulta APIs abertas pelo DOI e baixa o texto estruturado ou o PDF |

A forma C nunca cobre 100% dos artigos (artigos com acesso pago). Por isso A e B continuam sendo o caminho alternativo.

Requisitos da entrada manual:

- Aceitar texto integral colado ou preenchimento por seções.
- Permitir editar, substituir e remover conteúdo.
- Alertar sobre alterações não salvas ao sair do editor.
- Nunca descartar conteúdo por não reconhecer os títulos das seções.
- Não substituir o conteúdo já salvo até o usuário confirmar a nova versão, inclusive ao cancelar uma importação.

## 4. Ferramentas necessárias

### Extração e estruturação

| Ferramenta | Uso | Observações |
| --- | --- | --- |
| **`pdfjs-dist`** (Mozilla) | Extrair texto do PDF no navegador, com posição (x/y) e página | Dependência nova; carregar sob demanda (`import()`) junto com o worker |
| **Regras próprias (`sections.js`)** | Achar títulos de seção em PT/EN/ES (Introduction/Introdução, Methods/Metodologia, Results and Discussion, Conclusões, References…) | Primeira tentativa, sem custo |
| **GROBID** (opcional, Docker `grobid/grobid`, porta 8070) | Converter PDF científico em TEI-XML com seções, títulos e referências separados | Muito mais preciso que regras em PDFs de 2 colunas. Requer Docker/Java; o app chama via servidor local (`POST /api/processFulltextDocument`) |
| **Jev ou ChatGPT** (já integrados) | Classificar blocos que as regras não conseguiram identificar | Último recurso; guardar a origem: `regra`, `grobid`, `ia` ou `manual` |
| **`DOMParser`** (nativo do navegador) | Ler JATS (Europe PMC) e TEI (GROBID) | Sem dependência nova |
| **Tesseract.js** ou **OCRmyPDF** | OCR de PDFs escaneados | Fase futura |

Tratar PDFs inválidos, protegidos, vazios ou sem camada de texto com mensagem útil e a alternativa de entrada manual. Definir limites de tamanho e de páginas com base em testes de desempenho.

### Captura automática por DOI

| API | O que fornece | Chave? |
| --- | --- | --- |
| **Europe PMC REST** | `fullTextXML` em JATS, **já dividido em seções** (biomedicina, PMC) | Não |
| **OpenAlex** (`/works/doi:{doi}`) | `best_oa_location.pdf_url`, licença, status de acesso aberto | Não (enviar `mailto` para entrar no *polite pool*) |
| **Unpaywall** (`/v2/{doi}?email=`) | Melhor link de acesso aberto (PDF ou página) | Exige e-mail como parâmetro |
| **Semantic Scholar Graph API** | Campo `openAccessPdf` | Opcional (aumenta o limite de uso) |
| **arXiv API** | PDF de preprints | Não |
| **CORE API** | Texto completo de repositórios institucionais | Sim (gratuita) |
| Elsevier, Springer, Wiley (TDM) | Texto de assinantes | Sim, chave institucional; fase futura e opcional |

**Ponto técnico importante:** as APIs de metadados (OpenAlex, Unpaywall, Europe PMC) geralmente permitem chamadas direto do navegador (CORS). Já o **download de PDFs de editoras e repositórios quase sempre é bloqueado por CORS**. A solução é usar o servidor local que já existe (`server/chatgptServer.js`, porta 1455):

- adicionar uma rota `/api/fulltext/fetch`;
- aceitar só domínios devolvidos pelas APIs acima;
- exigir `Content-Type: application/pdf`, limitar o tamanho (por exemplo, 30 MB) e definir timeout;
- incluir a rota no proxy do `vite.config.js`.

Na versão hospedada (Vercel) sem servidor local, a forma C fica limitada a JATS e PDFs com CORS liberado.

Só buscar fontes legais de acesso aberto, e mostrar a licença encontrada.

### Importação em lote: ligar cada PDF ao artigo certo

1. **Escolher arquivos:** `showDirectoryPicker()` para selecionar uma pasta inteira (Chromium); nos outros navegadores, `<input type="file" multiple webkitdirectory>`.
2. **Ligar PDF ↔ artigo**, em ordem de confiança:
   - campo `file` do BibTeX exportado por Zotero, JabRef ou Mendeley (hoje o importador ignora esse campo), comparando pelo nome do arquivo;
   - DOI nos metadados do PDF (`pdf.getMetadata()`) ou nas 2 primeiras páginas (regex `10\.\d{4,9}/\S+`), comparado com `article.doi` já normalizado;
   - semelhança do título (normalizado, coeficiente de Dice ≥ 0,9).
3. **Revisão:** uma tela lista os PDFs ligados, os ambíguos e os que não foram ligados, para o usuário confirmar ou corrigir à mão.

## 5. Fluxo e interface

- **`src/components/ArticleModal.jsx`:** nova seção "Texto do artigo", antes do painel Sugestão, disponível mesmo sem IA configurada.
  - Estados: vazio, extraindo (com cancelar), disponível (origem, páginas, caracteres), seções pendentes, erro.
  - Ações: Colar texto, Importar PDF, Buscar em acesso aberto, Revisar seções, Remover.
  - Editor por seção, com a classificação editável. Seções combinadas (por exemplo, "Resultados e Discussão") vão para as duas chaves.
  - Na prévia de PDF, permitir revisar a ordem de leitura, especialmente em documentos com duas colunas.
- **Lista de artigos:** ações em lote "Anexar PDFs (pasta)" e "Buscar textos em acesso aberto", com progresso e resumo (encontrados, só resumo, não encontrados).
- **`src/components/SuggestionPanel.jsx`:** quando a decisão for `needs-text`, mostrar o botão "Adicionar texto" e informar o que falta para aquela etapa. O botão "Salvar e avaliar" aparece só se a IA estiver configurada. Não apresentar os campos esperados como se tivessem sido analisados.
- **`src/components/JevBatchModal.jsx`:** antes de iniciar, mostrar quantos artigos do lote têm texto suficiente e quantos ficarão como `needs-text`.

## 6. Persistência

Formato proposto para `article.fullText`, sem mudar `sections`, que a avaliação já usa:

```js
fullText: {
  source: 'paste' | 'pdf' | 'europepmc' | 'unpaywall' | 'openalex' | ...,
  fileName, pages, chars, license, url, addedAt, updatedAt,
  raw: '...texto integral sem referências...',
  blocks: [{ text, page, section, origin: 'rule'|'grobid'|'ai'|'manual', confidence }],
  sections: { introduction, methods, results, discussion, conclusion }, // derivado de blocks
  unassigned: '...',            // nunca descartar texto não classificado
  reviewed: false, partial: true
}
```

- **Arquivo `.srp`:** o texto fica nele, para o projeto continuar portável. Precisa de uma nova versão de schema (1.6.0) em `src/fileSystem.js`, com migração que normalize o `fullText: null` antigo. `blocks` é a representação canônica; `sections` e `unassigned` são reconstruídos a partir dela após cada edição.
- **Auto-save:** gravar no `localStorage` sem `raw`, `blocks` e `sections`, e guardar esses textos no **IndexedDB** (`sysreview-fulltext`, chave = `article.id`). Ao restaurar, juntar os dois.
- **PDF original:** não guardar na primeira entrega. Um caminho local não garante que o arquivo estará disponível em outro computador.

## 7. Integração com a avaliação por IA

Em `src/ai/screening.js`:

- **`hasEnoughText`:**
  - Filtro 2 exige introdução **ou** conclusão;
  - Filtro 3 exige métodos **ou** resultados, além de um mínimo de caracteres;
  - registrar `partial` e as seções ausentes na sugestão.
- **`buildState` do Filtro 3:** incluir `unassigned` quando houver texto sem seção identificada, e atualizar `STAGE_FIELDS`, `fieldsUsed` e o texto das perguntas.
- **Limites:** antes de enviar, usar `estimateTokens`.
  - Se passar do limite do Jev (32k por estado + pergunta), oferecer o *long context* (já existe em `JevSettingsModal.jsx`) ou uma redução **explícita e visível**: remover referências e legendas, priorizar métodos e resultados. Nunca truncar sem avisar.
  - Aumentar o limite de 2 MB do servidor só se for necessário.
- **Custo:** o Jev repete o texto inteiro para cada pergunta. Exemplo: 10k tokens × 10 critérios × 300 artigos ≈ 30M tokens ≈ US$ 1,26 a US$ 0,042/Mtok. Mostrar essa estimativa antes do lote.
- **Validade das sugestões:** ao editar o texto, as sugestões dos Filtros 2 e 3 já passam a aparecer como desatualizadas (pelos hashes). Falta garantir que o modal e o lote usem a versão **atual** do artigo depois de salvar. Uma resposta pendente nunca pode aparecer como válida para uma versão nova do texto.
- **Decisões manuais:** preservar decisões já tomadas; não reavaliar automaticamente ao salvar, salvo pela ação explícita "Salvar e avaliar".
- **Privacidade:** avisar que o texto completo é enviado ao provedor, e registrar o uso da API no acompanhamento existente.

## 8. Fases de entrega

| Fase | Entrega | Resultado |
| --- | --- | --- |
| **1. Texto manual** | Editor de colar/seções, schema 1.6.0, IndexedDB no auto-save, `hasEnoughText`/`buildState` revisados, mensagens de `needs-text` | **Filtros 2 e 3 com IA já funcionam** |
| **2. PDF** | `pdfjs-dist`, ordem de leitura em 2 colunas, `sections.js` por regras, importação individual e por pasta com ligação automática | Fluxo prático para quem já tem os PDFs |
| **3. Captura automática** | `src/fulltext/openAccess.js` (Europe PMC → OpenAlex/Unpaywall → Semantic Scholar/arXiv) + rota no servidor local | Preenchimento automático dos artigos em acesso aberto |
| **4. Seções avançadas** | GROBID opcional e classificação de blocos por IA, com revisão manual | Mais precisão em PDFs difíceis |
| **5. Evoluções** | OCR, API local do Zotero (`localhost:23119`), APIs TDM institucionais | Mais cobertura |

## 9. Validação e critérios de aceite

Testes automatizados (`node --test`, mesmo padrão de `tests/`):

- detecção de seções (PT/EN, numeradas, combinadas);
- ligação por DOI e por título;
- migração 1.5.0 → 1.6.0 e auto-save com textos grandes;
- `hasEnoughText` e `buildState` por filtro;
- sugestão desatualizada depois de editar o texto.

Critérios de aceite:

- Colar texto, salvar, fechar e reabrir o `.srp` sem perda de conteúdo.
- Abrir projetos antigos sem `fullText` e continuar trabalhando normalmente.
- Substituir ou remover texto sem alterar outro artigo.
- Cancelar uma importação sem perder o conteúdo anterior.
- Importar PDFs com acentos, títulos em idiomas diferentes e duas colunas.
- Confirmar que os Filtros 2 e 3 recebem o conteúdo previsto, tanto individualmente quanto em lote.
- Representar corretamente ausência de texto, conteúdo parcial e avaliação concluída.
- Validar limites e desempenho com artigos extensos, sem perda silenciosa de conteúdo.
- Para a qualidade das seções, comparar com uma amostra marcada à mão (por exemplo, 30 artigos dos arquivos `.srp` de benchmark), registrar erros por categoria e ajustar regras e limiares antes de adotar a classificação automática como padrão.

## 10. Decisões pendentes

1. **Avaliação com texto parcial:** bloquear, ou permitir com aviso (recomendação: permitir com aviso, sem aplicar em lote)?
2. **GROBID:** vale exigir Docker de quem quiser mais precisão, ou usar só regras + IA?
3. **Versão hospedada:** a captura automática fica restrita ao uso com o servidor local, ou vale criar uma função serverless na Vercel?
