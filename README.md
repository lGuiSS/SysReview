# SysReview - Sistema de Revisão Bibliográfica Sistemática

Uma ferramenta local para condução de **revisões bibliográficas sistemáticas** seguindo a metodologia **PRISMA**. O SysReview guia o pesquisador desde a definição do protocolo até a análise bibliométrica e exportação dos resultados, com integração opcional ao ChatGPT por um serviço local.

## Funcionalidades

- **Definição de Protocolo** - Título, questão de pesquisa, palavras-chave, critérios de inclusão/exclusão, bases de dados alvo e configuração do sistema de pontuação
- **Importação de Artigos** - Suporte a BibTeX (Scopus, Web of Science, ScienceDirect) e MEDLINE (PubMed) com detecção automática de duplicatas (DOI + título normalizado)
- **Sistema de Pontuação Automática** - Scoring por correspondência de palavras-chave com pesos configuráveis para título, resumo e palavras-chave
- **Processamento de Dados** - Marcação de duplicatas, inclusão e exclusão individual ou em lote
- **Três Estágios de Filtro** - Filtros cascata com critérios de inclusão/exclusão do protocolo, com menu de contexto para ação rápida
- **Estatísticas e Visualizações** - Diagrama de fluxo PRISMA, gráficos por ano, país e periódico, extração de dados baseada nos critérios do protocolo
- **Bibliometria** - Redes de co-autoria, co-ocorrência de palavras-chave, detecção de comunidades (Louvain) e visualização de rede
- **Exportação** - Projeto completo em arquivo `.srp` e planilha `.xlsx` com dados extraídos
- **Auto-save** - Salvamento automático no localStorage com opção de auto-save via File System Access API
- **Internacionalização** - Interface em Português Brasileiro (padrão) e Inglês

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Framework | React 19 + Vite 7 |
| Estilização | Tailwind CSS 3 |
| Gráficos | Recharts |
| Exportação Excel | ExcelJS |
| Ícones | Lucide React |
| i18n | react-i18next |
| Análise de Redes | Graphology + Louvain |
| Visualização de Rede | vis-network |
| Persistência | localStorage + File System Access API |

## Pré-requisitos

- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- npm (incluído com o Node.js)

## Instalação e Execução

```bash
# Clone o repositório
git clone <url-do-repositorio>

# Navegue até o diretório do projeto
cd sistema-revisao-bibliografica

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

## Comandos Disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento com Hot Module Replacement |
| `npm run build` | Gera a versão de produção na pasta `dist/` |
| `npm run preview` | Pré-visualiza a build de produção |
| `npm run lint` | Executa o linting com ESLint |

## Estrutura do Projeto

```
src/
├── App.jsx                        # Componente principal (toda a lógica e UI)
├── main.jsx                       # Ponto de entrada da aplicação
├── fileSystem.js                  # Salvamento/carga de projetos (.srp) com versionamento de schema
├── index.css                      # Estilos globais
├── assets/                        # Imagens e recursos estáticos
├── bibliometrics/                 # Análise bibliométrica
│   ├── CoAuthorshipAnalysis.jsx   #   Rede de co-autoria
│   ├── KeywordCoOccurrence.jsx    #   Co-ocorrência de palavras-chave
│   ├── CommunityDetection.jsx     #   Detecção de comunidades (Louvain)
│   ├── NetworkVisualization.jsx   #   Visualização de rede (vis-network)
│   └── DensityVisualization.jsx   #   Visualização de densidade
├── components/                    # Componentes de UI
│   ├── ArticleModal.jsx           #   Modal de detalhes do artigo
│   ├── StatisticsSection.jsx      #   Gráficos e estatísticas
│   ├── AlertModal.jsx             #   Modal de alerta/toast
│   ├── UnsavedWarningModal.jsx    #   Aviso de alterações não salvas
│   ├── ReminderSettingsModal.jsx  #   Configuração de lembretes
│   ├── SupportModal.jsx           #   Modal de apoio/doação
│   ├── SupportRequestModal.jsx    #   Solicitação automática de apoio
│   └── AutoSaveOfferModal.jsx     #   Oferta de auto-save
├── countryPatterns/               # Padrões de nomes de países (2002 registros)
│   └── countryPatterns_v3.json    #   Extração automática de afiliação → país
├── i18n/                          # Internacionalização
│   ├── index.js                   #   Configuração do i18next
│   └── locales/
│       ├── pt.json                #   Traduções em Português Brasileiro
│       └── en.json                #   Traduções em Inglês
└── icons/
    └── SysReviewIcon.jsx          # Ícone SVG do projeto (globo)
```

## Fluxo de Trabalho

```
┌─────────────────────┐
│  1. Protocolo        │  Definir título, questão de pesquisa, palavras-chave,
│     de Revisão        │  critérios, bases de dados e configuração de pontuação
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  2. Importação       │  Importar BibTeX (Scopus/WoS/ScienceDirect) ou
│     de Artigos        │  MEDLINE (PubMed) com detecção de duplicatas
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  3. Processamento    │  Marcar como duplicata, incluir ou excluir
│     de Dados          │  (individual ou em lote)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  4. Filtros 1→2→3   │  Filtragem cascata com critérios de inclusão/
│     Sequenciais       │  exclusão; excluir em qualquer etapa reseta etapas posteriores
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  5. Estatísticas     │  Diagrama PRISMA, gráficos por ano/país/periódico,
│     e Bibliometria    │  redes de co-autoria, co-ocorrência de palavras-chave
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  6. Exportação       │  Arquivo de projeto .srp ou planilha .xlsx
└─────────────────────┘
```

## Sistema de Pontuação

O scoring automático avalia a relevância de cada artigo com base na correspondência de palavras-chave:

**Opções configuráveis:**
- Ignorar maiúsculas/minúsculas
- Correspondência por palavra exata (word boundary)
- Contar múltiplas ocorrências da mesma palavra-chave

O score é recalculado automaticamente ao alterar as palavras-chave ou a configuração (debounce de 500ms).

## Salvamento e Persistência

- **Auto-save (localStorage):** Salvamento automático a cada 5 segundos no armazenamento local do navegador
- **Auto-save (arquivo):** Após o primeiro salvamento manual, opção de habilitar auto-save direto no arquivo `.srp` via File System Access API
- **Salvar manualmente:** Cria e baixa um arquivo `.srp` (JSON com metadados e versionamento de schema v1.2.0)
- **Restauração:** O projeto é restaurado automaticamente ao recarregar a página (localStorage) ou ao abrir um arquivo `.srp`
- **Aviso de alterações não salvas:** Lembrete configurável antes de sair da página ou após período sem salvar

## Formatos de Importação

| Formato | Fonte | Extensão |
|---|---|---|
| BibTeX | Scopus, Web of Science, ScienceDirect | `.bib` |
| MEDLINE | PubMed | `.txt` |

> É necessário informar a **string de busca** utilizada em cada importação para rastreabilidade.

## Idiomas

- **Português Brasileiro (pt-BR)** - Idioma padrão
- **Inglês (en)** - Disponível via seletor na interface

## Autor

**Guilherme Santos Silva** - São Carlos, SP, Brasil

## Desfazer exclusão por score 0

Em **Tratamento de dados**, use **Excluir artigos com score 0** e, quando necessário,
**Desfazer exclusão por score 0**. A opção de incluir aprovados é explícita.
O último lote efetivo fica no projeto `.srp` (histórico desde 1.4; formato atual 1.5), inclusive nos
salvamentos automáticos. Cada artigo retorna ao status anterior, preservando
edições posteriores. Artigos removidos ou com outra decisão de tratamento
são ignorados. Projetos antigos abrem normalmente; exclusões antigas não
possuem histórico para desfazer.

## ChatGPT com OAuth na seleção assistida

Requer Node.js 22 ou superior para o serviço local. O JEV continua disponível.
Para usar o aplicativo compilado com ChatGPT:

```bash
npm run build
npm run chatgpt
```

Abra **http://127.0.0.1:1455**. Nas configurações de IA, selecione
**ChatGPT (OAuth)**, clique em **Continuar com ChatGPT**, conclua a autorização
na aba aberta e volte ao aplicativo. Escolha um modelo disponibilizado pela sua
conta e salve as configurações. Avaliações individuais e em lote usam os
mesmos critérios e regras de decisão existentes.

Para desenvolver, mantenha `npm run chatgpt` em uma janela e execute
`npm run dev` em outra, abrindo **http://127.0.0.1:5173**. Use `127.0.0.1`
para que o cookie da sessão acompanhe o callback OAuth. No PowerShell com
scripts bloqueados, use `npm.cmd`. Se o carregador de configuração do Vite
esbarrar em permissões dos diretórios ancestrais, use
`npm.cmd run build -- --configLoader runner`.

O fluxo segue a [documentação oficial de registro e login](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
e de [modelos e inferência](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).
A disponibilidade depende da elegibilidade da conta, da permissão de uso do
plano e dos limites/créditos aplicáveis. Não é necessária uma API key da OpenAI.

O serviço escuta apenas em loopback e guarda os tokens OAuth na memória;
é preciso entrar novamente depois de reiniciá-lo. Somente o identificador do
host e a referência de registro da conta ficam em `.local/chatgpt-host.json`,
ignorado pelo Git. Desconectar apaga a sessão local e a referência da conta;
para revogar o acesso no provedor, use as configurações do ChatGPT.
Tokens não entram no navegador, no localStorage nem em arquivos `.srp`.
O texto necessário do artigo e os critérios são enviados à OpenAI quando
você solicita uma avaliação. Probabilidades retornadas pelo ChatGPT são
estimativas do modelo, não medições calibradas, e exigem revisão humana.

A hospedagem estática continua funcionando com JEV. Este fluxo OAuth é para
execução local; publicar o frontend estático sozinho não oferece OAuth.

Validação: `npm test`, `npm run build`, `npm run lint`.

## Avaliação minimizável, esforço de raciocínio

A avaliação pode ser **minimizada** sem interromper a fila. Um painel compacto
mostra o progresso em qualquer seção. **Expandir** volta ao mesmo lote;
**Interromper** preserva resultados já concluídos. O X durante a execução
minimiza. Fechar/recarregar a aba encerra a execução; não há retomada automática.
Abrir/criar outro projeto cancela o lote anterior e impede gravações tardias.

Nas configurações de IA, escolha **Esforço de raciocínio** por provedor/modelo.
**Padrão do provedor** omite o parâmetro. O esforço de um lote já iniciado
permanece fixo. JEV mantém seu contrato atual; modelos desconhecidos oferecem
somente o padrão até que haja suporte confirmado.

**Revisão manual**, **Sem texto** e **Erros** são situações distintas. O filtro
IA: revisão manual reúne os itens que exigem atenção e mostra seus motivos,
além de manter a repetição somente dos itens com erro. Uma tentativa com falha preserva a sugestão anterior e todas
as decisões humanas. A aplicação revalida as condições atuais e não sobrescreve
uma decisão manual feita enquanto a avaliação estava minimizada.

Após interromper, use **Continuar avaliação** no modal ou painel compacto para
retomar os itens não concluídos. O lote conserva resultados, contagens e consumo
anteriores; itens com erro têm uma ação separada de nova tentativa. A retomada
vale para o lote aberto na sessão e verifica novamente a conexão com o provedor.

ChatGPT usa respostas estruturadas com evidência ou abstenção por
critério. Não é usado 50% como substituto de evidência ausente. Um critério
não verificado exige conferência. No Filtro 1, se todos os critérios de inclusão
foram avaliados e atendem ao limiar e nenhuma exclusão avaliada chega a 50%,
é possível sugerir inclusão com verificações de exclusão pendentes. O aviso
permanece visível e a aceitação é explícita. Citações rejeitadas e critérios de
inclusão não avaliados continuam exigindo revisão manual, assim como pendências
nos Filtros 2/3. Uma exclusão avaliada com probabilidade
de pelo menos 50% permite sugerir exclusão e aceitar após conferência, mesmo
com outros critérios não verificados. Esses casos também podem ser aplicados em lote
após confirmação, respeitando os limites configurados. Os critérios não
verificados permanecem sinalizados e nulos; não são motivos de decisão.
Avaliações inválidas ou desatualizadas e decisões manuais permanecem
protegidas. Em particular, acesso
ao texto completo não pode ser comprovado apenas por título/resumo.

Se a citação de um critério não for localizada em um campo do estudo, sua
probabilidade é descartada e o artigo exige revisão manual, com aviso no painel
da sugestão. Os demais critérios válidos são preservados. Probabilidades
inválidas e respostas malformadas continuam sendo erros, agora com motivo
específico. Depois de atualizar, reinicie o serviço local e recarregue o app;
erros já registrados só recebem o novo diagnóstico após uma nova tentativa.

Sugestões generativas históricas são preservadas, mas exigem reavaliação antes
de aceitar/aplicar pela IA. As ações manuais continuam disponíveis. Os limiares
existentes não tornam as estimativas generativas automaticamente calibradas;
compare uma amostra com revisão humana antes de excluir em massa.

O formato **1.5.0** guarda evidência, critérios não verificados, esforço,
diagnóstico da última tentativa e revisões das decisões. Projetos anteriores
abrem normalmente. Use a versão atual para arquivos novos: versões antigas não
conhecem o contrato de abstenção. O desfazer da exclusão por score 0 permanece
compatível com salvar/reabrir e com o salvamento automático.

Os testes cobrem contratos de respostas, fila, cancelamento, conflitos,
persistência, OAuth e renderização dos controles em português/inglês. A
conferência visual interativa em navegador e o teste com contas reais continuam
necessários; testes de renderização não comprovam layout em todos os tamanhos.

O seletor de artigos agrupa as situações de IA sem decisão aplicável em
**IA: revisão manual**: avaliação inconclusiva, texto insuficiente, erro,
resultado abaixo do limite, avaliação desatualizada ou ainda não realizada.
A lista e os detalhes mostram o motivo de cada artigo. Uma tentativa com erro
não desloca para revisão uma sugestão anterior ainda válida e dentro dos
limites; nesse caso o erro aparece como aviso. Os grupos de IA são separados
dos status das decisões humanas, que permanecem preservados.
