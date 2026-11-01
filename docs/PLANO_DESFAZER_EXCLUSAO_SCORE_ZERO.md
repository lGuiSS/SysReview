# Planejamento: desfazer exclusão por score 0

Data: 27/10/2026  
Status: implementado em 28/10/2026; validação automatizada concluída. Conferência visual pendente por limitação da automação do navegador.

## Objetivo

Adicionar uma forma segura de desfazer a última exclusão em lote por score 0 em Tratamento de dados, restaurando o estado anterior de cada artigo atingido e preservando alterações posteriores.

## Comportamento observado

Em `src/App.jsx`, `DataProcessingSection.handleExcludeScore`:

- Seleciona artigos com `score === 0` e `dataProcessingStatus === 'pending'`.
- Quando a opção de incluir aprovados está ativa, também seleciona os que estão como `included`.
- Chama `handleUpdateStatus` individualmente para marcar cada artigo como `excluded`.
- Não remove os registros do projeto, mas também não registra quais exclusões pertencem à operação nem o estado anterior de cada artigo.

A função genérica `handleUpdateStatus`, além de alterar o status e `lastModified`, define `isDuplicate: false` e substitui `inclusionCriterion`, `exclusionCriterion` e `qualityCriteria` por listas vazias quando chamada sem critérios. Esses efeitos não devem ser propagados para a nova operação específica de score 0.

As estatísticas são derivadas dos artigos por `useMemo`. O projeto tem diversos caminhos de salvamento, incluindo manual e automático. O histórico necessário para desfazer deve participar desses caminhos.

Revalidar esses pontos antes de implementar, pois o código pode mudar.

## Escopo inicial recomendado

- Desfazer somente a última operação de exclusão por score 0 que ainda tenha itens restauráveis.
- Manter a possibilidade de desfazer ao trocar de seção, salvar e reabrir o projeto.
- Não criar um histórico genérico de todas as ações nem uma função de refazer nesta entrega.
- Não tentar identificar retroativamente exclusões realizadas antes desse recurso.
- Não alterar a regra existente de score: somente o número `0` é elegível. Score ausente, `null`, texto `"0"` ou valor calculado diferente de zero não deve ser incluído implicitamente.

## Interface

No cartão de score 0:

1. Ajustar o texto do botão para **Excluir artigos com score 0**, deixando claro que se trata de classificação, não remoção física.
2. Manter explícita a opção de atingir também os artigos já aprovados.
3. Após uma operação efetiva, mostrar a quantidade alterada e **Desfazer exclusão por score 0**.
4. O botão de desfazer deve continuar acessível no cartão, sem depender de um aviso temporário.
5. Ao desfazer, informar quantos voltaram a pendente, quantos voltaram a aprovado e quantos não foram restaurados por alterações posteriores ou ausência do registro.
6. Sem itens restauráveis, desabilitar a ação e explicar o motivo quando necessário.

Se uma nova exclusão efetiva substituir a única operação disponível para desfazer, informar isso antes da execução. Uma tentativa que não encontre artigos elegíveis não deve apagar o histórico existente.

Adicionar os textos em português e inglês. Verificar quebra de linha, navegação por teclado e leitura em telas pequenas.

## Operação específica e atualização atômica

Criar uma operação própria para exclusão por score 0 no estado central do projeto. Evitar chamar repetidamente o atual handler genérico.

A operação deve:

- Selecionar os elegíveis a partir do estado mais recente, usando a opção de incluir aprovados capturada no clique.
- Calcular uma única transição contendo artigos atualizados e o registro para desfazer.
- Alterar apenas `dataProcessingStatus`, a data de modificação e os metadados necessários à rastreabilidade.
- Preservar critérios, `isDuplicate`, `duplicateOf`, sugestões da IA, origem de decisões, texto completo, extração e status dos Filtros 1, 2 e 3.
- Preservar os objetos dos artigos não atingidos.
- Evitar entradas duplicadas no histórico por clique duplo ou reexecução do React.

Preferir uma função pura de transição e estado coordenado, como um reducer limitado a esse domínio. Não executar efeitos, setters adicionais, geração de identificadores ou notificações dentro de uma função de atualização que o React possa executar novamente. Gerar identificador e horário da ação antes de aplicar a transição.

Não reestruturar todo o estado do aplicativo para implementar esse recurso. Escolher a menor mudança que garanta coerência entre artigos e histórico.

## Registro necessário para desfazer

Guardar um registro de operação com:

- Identificador único e data da operação.
- Opção usada: somente pendentes ou também aprovados.
- Para cada artigo realmente alterado: ID, status anterior e status aplicado.
- Identificador/revisão da alteração de tratamento de dados, permitindo verificar se o artigo ainda pertence à operação.
- Estado da entrada: disponível, restaurada ou invalidada por alteração posterior.

Não armazenar uma cópia completa de todos os artigos. Restaurar um snapshot global apagaria importações e edições feitas depois.

### Proteção contra alterações posteriores

Comparar apenas `dataProcessingStatus === 'excluded'` não é suficiente: o usuário pode incluir e excluir novamente o mesmo artigo. Usar um identificador ou uma revisão da decisão de tratamento de dados que mude em toda nova decisão desse domínio, inclusive decisões que repetem o mesmo status.

Antes de implementar, mapear todos os caminhos que alteram esse domínio: ações manuais na lista, classificação de duplicatas, importação/deduplicação, aceitação de pendentes e substituição do projeto. Nenhum desses caminhos pode deixar um marcador antigo parecer válido.

Não usar somente `lastModified` para conflito: uma edição de título não deve impedir a restauração do status se a decisão de tratamento de dados continua intacta.

## Regras de restauração

Para cada entrada da última operação:

1. Localizar o artigo pelo ID no projeto atual.
2. Verificar se a revisão/marcação ainda corresponde à exclusão registrada.
3. Se corresponder, restaurar o status anterior: `pending` ou `included`.
4. Preservar os demais campos atuais, incluindo alterações bibliográficas e decisões de filtros posteriores.
5. Atualizar a data da modificação e consumir a entrada de histórico.
6. Se o artigo não existir ou tiver recebido outra decisão de tratamento de dados, não sobrescrever; consumir/inativar a entrada com motivo e informar no resultado.

O desfazer deve ser idempotente: repetir o comando não restaura os mesmos itens duas vezes. Não deve restaurar critérios ou marcações a partir de snapshots antigos.

Uma alteração posterior do score não deve, por si só, impedir desfazer: a elegibilidade se baseia na operação original e na revisão da decisão, não em recalcular os artigos com score 0 no momento da restauração.

## Persistência e ciclo de vida

- Definir um campo versionado de histórico no projeto e uma migração compatível com arquivos antigos, inicialmente sem operação disponível.
- Atualizar serialização, abertura, salvamento manual, salvamento automático em arquivo e eventual recuperação local.
- Salvar artigos e histórico na mesma versão do projeto para evitar operações sem registro de reversão.
- Verificar a detecção de alterações não salvas para exclusão e desfazer.
- Ao abrir ou criar outro projeto, substituir/limpar o histórico junto com os artigos. Nunca reaproveitar por coincidência de IDs.
- Validar referências ao carregar o arquivo; artigos inexistentes não podem provocar falha.
- Recalcular estatísticas pelo estado dos artigos, sem manter contadores paralelos.
- Confirmar que importação e deduplicação preservam ou invalidam corretamente as referências existentes.

## Exclusões anteriores ao recurso

Os projetos atuais não têm informação suficiente para distinguir uma exclusão por score 0 de outra exclusão nem reconstruir o status anterior. Não oferecer restauração automática dessas exclusões.

Uma ferramenta futura de revisão manual pode listar excluídos com score 0, mas deverá deixar claro que não está desfazendo uma operação conhecida. Essa ferramenta fica fora do escopo inicial.

## Etapas de implementação

1. Mapear todas as escritas de status de tratamento de dados e os caminhos de persistência; registrar os invariantes que devem ser preservados.
2. Definir formato do histórico, revisão por decisão e migração.
3. Implementar e testar as funções puras de excluir e desfazer, incluindo conflitos e chamadas repetidas.
4. Conectar as transições ao estado central e aos demais caminhos de decisão que invalidam entradas antigas.
5. Integrar serialização e abertura do projeto.
6. Adicionar botão, contagens, mensagens e traduções.
7. Executar testes de regressão e verificação manual do fluxo completo.

## Testes obrigatórios antes da entrega

| Cenário | Resultado esperado |
| --- | --- |
| Pendentes com score 0 | Exclui e restaura para pendente |
| Aprovados com score 0, opção desligada | Não altera |
| Aprovados com score 0, opção ligada | Exclui e restaura para aprovado |
| Mistura de pendentes e aprovados | Cada artigo recupera seu próprio estado anterior |
| Excluídos e duplicatas preexistentes | Não entram no lote |
| Score ausente, `null`, `"0"` ou diferente de 0 | Não entra no lote |
| Artigo com critérios, extração e decisões posteriores | Excluir/desfazer preserva esses campos |
| Editar título/resumo após o lote | Desfazer preserva a edição e restaura o status |
| Nova decisão manual ou de duplicidade após o lote | Desfazer não sobrescreve essa decisão |
| Incluir e excluir novamente após o lote | Revisão detecta a mudança mesmo com status final igual |
| Alterar score após o lote | Não impede restauração se a decisão continua sendo a registrada |
| Importar artigos depois do lote | Não remove nem modifica os novos artigos ao desfazer |
| Artigo removido após o lote | Ignora com contagem correta; não recria registro |
| Duplo clique e modo estrito do React | Não duplicam lote nem notificações |
| Desfazer duas vezes | Segunda execução não muda dados |
| Excluir sem itens elegíveis | Preserva a operação anterior disponível |
| Nova exclusão efetiva | Substitui o histórico conforme a regra informada na interface |
| Trocar de seção | Ação continua disponível |
| Salvar/reabrir e recuperar salvamento automático | Histórico e artigos permanecem coerentes |
| Abrir outro projeto com IDs iguais | Nenhuma restauração do projeto anterior é aplicada |
| Projeto antigo sem histórico | Abre normalmente e não inventa estados anteriores |
| Exclusão/desfazer | Estatísticas, filtros e alterações não salvas refletem o estado atual |

Executar o build e o lint. Se existirem falhas anteriores, distingui-las das introduzidas pela mudança e garantir que o código novo não amplie os problemas.

## Critério de conclusão

A entrega estará pronta quando o usuário conseguir excluir um lote e desfazê-lo, inclusive após salvar/reabrir, com restauração individual dos estados originais, preservação de edições posteriores e nenhum efeito colateral em critérios, duplicatas, filtros, extração ou outros artigos.


## Registro da implementação (28/10/2026)

- `src/scoreZeroHistory.js`: transições puras e atômicas, histórico versionado e revisão por decisão.
- `src/App.jsx`: interface persistente, confirmação de substituição de lote, revisões em decisões manuais, importação/deduplicação e substituição integral ao abrir/criar projeto.
- `src/fileSystem.js`: schema 1.4.0 com migração, salvamento manual/automático e recuperação local. O backup agora consulta o estado atual em vez do estado capturado na montagem.
- Textos em português e inglês; botões responsivos, `aria-pressed`, estado desabilitado e resultado em região `aria-live`.
- Testes em `tests/scoreZeroHistory.test.js`, incluindo conflitos, chamadas repetidas, importação posterior, campos preservados, migração e recuperação de arquivos/backup.
- ChatGPT OAuth adicionado como provedor alternativo ao JEV. Instruções e limites de execução local estão no README.

Validação: testes automatizados e build aprovados. No ambiente restrito,
o build usa `npm.cmd run build -- --configLoader runner` para evitar o acesso
do carregador padrão a diretórios ancestrais. O lint mantém os mesmos
104 erros e 48 avisos preexistentes, sem problemas adicionais.
A automação visual foi interrompida por não identificar a URL atual do Edge
com segurança; navegação visual, teclado/tela pequena e OAuth com conta real
continuam como verificações manuais. Os testes OAuth usam respostas simuladas.
