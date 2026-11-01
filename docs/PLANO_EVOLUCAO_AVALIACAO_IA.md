# Plano: avaliação minimizável, esforço configurável e Gemini

Data: 28/10/2026  
Status: Gemini removido a pedido do usuário em 28/10/2026. Demais recursos implementados; testes automatizados aprovados. A conferência visual interativa permanece pendente.

## 1. Objetivos e limites

Permitir acompanhar uma avaliação em segundo plano, escolher o esforço de raciocínio e utilizar Gemini além de JEV e ChatGPT, preservando decisões humanas e o fluxo de revisão manual.

A implementação foi autorizada pelo usuário após este planejamento. O usuário informou que ainda não possui projeto/cliente OAuth Google e escolheu deixar essa configuração documentada. Não foram executadas avaliações pagas, criados clientes OAuth ou alterados os arquivos de benchmark.

Premissa para Gemini: integração com OAuth Google, em continuidade à solicitação anterior. O acesso terá cotas e eventual cobrança próprias da API; login Google não representa autorização para usar benefícios de uma assinatura de chatbot.

Fora da primeira entrega futura: pausar/retomar requisições no servidor, executar com a aba fechada, retomar automaticamente após recarregar a página, múltiplos lotes simultâneos e implementar o plano separado de texto completo/PDF.

## 2. Situação atual e evidência da imagem

- `src/components/JevBatchModal.jsx` contém fila, progresso, AbortController, contagens e gravação periódica. Desmontar esse componente aborta as requisições. Durante a execução, o X chama a interrupção.
- `ArticlesList` em `src/App.jsx` mantém `batchSnapshot` e monta o modal. Não constitui um local estável para uma execução que deva sobreviver à navegação entre seções.
- O snapshot atual guarda artigos, mas protocolo, filtro e configurações ainda chegam como propriedades que podem mudar durante a execução.
- `server/chatgptServer.js` utiliza Responses com streaming, mas espera o resultado completo para validar o JSON. Não envia esforço de raciocínio.
- `server/chatgptProtocol.js` rejeita probabilidade ausente, não numérica ou fora de 0–1 com `Invalid probability: <id>`. Sem a resposta original, não é possível determinar qual desses casos ocorreu na imagem.
- O cartão “Revisão manual” do lote conta `uncertain`. “Sem texto” e erros são tratados separadamente. A lista agrupa `uncertain` e `needs-text` no filtro de sugestões incertas.
- Uma sugestão de exclusão pode ficar abaixo do limiar de aplicação em lote. Portanto, quantidade de sugestões de exclusão não equivale à quantidade de exclusões aplicadas.
- A imagem mostra 781 itens processados, 780 sugestões de exclusão e um erro. Isso não prova que as sugestões sejam incorretas nem que os status tenham sido alterados.
- `decide` assume inclusão mínima 1 e exclusão máxima 0 quando não há respostas dessas categorias. Isso exige atenção para distinguir categoria sem critérios de resposta obrigatória ausente.
- No Filtro 1, a regra atual sugere exclusão com probabilidade de exclusão >= 0,5; a aplicação em lote exige outro limiar. Pedir 0,5 para representar ausência de evidência pode produzir uma sugestão de exclusão. Investigar essa ambiguidade sem mudar silenciosamente a regra do JEV.

## 3. Avaliação minimizável

### Experiência proposta

1. Antes de iniciar, mostrar filtro, provedor, modelo, esforço e total selecionado.
2. Durante a execução, oferecer **Minimizar** e **Interromper** como ações distintas.
3. Minimizar remove o bloqueio da tela e mantém um painel compacto visível em qualquer seção: filtro, provedor/modelo, progresso, erros, **Expandir** e **Interromper**.
4. Expandir reabre a mesma execução, com os mesmos contadores; não cria outra fila.
5. O X durante a execução terá significado explícito de minimizar, com rótulo acessível e tooltip. Interrupção permanece em botão próprio.
6. Ao terminar, o painel informa conclusão e permite abrir o resumo ou dispensá-lo. Nenhuma sugestão é aplicada automaticamente.
7. Ao interromper, preservar resultados concluídos e descartar respostas ainda não consolidadas após o cancelamento. Não oferecer “Retomar” como se o provedor tivesse pausado a requisição.

Minimizado não significa executando com a aba fechada: o navegador pode suspender tarefas em segundo plano. Recarregar/fechar encerra a execução; preservar resultados já salvos, sem prometer continuidade.

### Organização do estado

- Extrair o controle da fila para um hook/controlador montado no estado central do aplicativo, fora de `ArticlesList` e do modal.
- Manter o modal e o painel compacto como visualizações do mesmo estado.
- Iniciar com um único lote ativo por projeto. Cliques repetidos e React StrictMode não podem duplicar chamadas.
- Capturar configuração imutável por execução: `jobId`, sessão do projeto, filtro, IDs selecionados, protocolo/critérios, hashes dos textos, provedor, modelo, esforço solicitado e versão do adaptador.
- Não colocar tokens ou objetos de sessão autenticada no snapshot. Vincular a execução à conexão/conta autorizada; desconectar ou trocar a conta interrompe o lote afetado.
- Trocar de seção mantém a execução. Abrir/criar/restaurar outro projeto cancela o lote anterior e troca a identificação da sessão, mesmo que os IDs dos artigos coincidam.
- Recusar retornos de um job cancelado ou de outra sessão de projeto. Um buffer antigo nunca pode gravar no projeto novo.
- Reutilizar a gravação periódica de sugestões e consumo, com identificação dos itens já consolidados para evitar duplicação no encerramento.
- Decisões humanas feitas enquanto o lote está minimizado têm precedência. A avaliação só grava sugestões; a aplicação posterior revalida status pendente e validade no estado atual.
- Se critérios ou texto mudarem, não usar respostas antigas como se fossem atuais. Registrar os hashes do snapshot e apresentá-las como desatualizadas.
- O aviso de saída deve considerar uma execução ativa, além das alterações ainda não salvas.

### Progresso e acessibilidade

- Identificar separadamente: aguardando, em execução, sucesso, erro, sem texto, reaproveitado e cancelado/não iniciado por interrupção.
- Definir uma contabilidade sem duplicação: total selecionado = soma dos estados mutuamente exclusivos de todos os itens.
- Usar “processados” quando o contador incluir erro ou falta de texto; reservar “avaliados com sucesso” para respostas válidas.
- Não colocar tentativas repetidas no denominador como novos artigos.
- Painel compacto responsivo, sem cobrir botões essenciais da lista; controles acessíveis por teclado, foco devolvido ao minimizar e `aria-live` com atualizações moderadas.
- Aviso de conclusão deve funcionar sem abrir o modal por cima do trabalho manual.

## 4. Esforço escolhido pelo usuário

- Adicionar **Esforço de raciocínio** às configurações do provedor/modelo e ao resumo antes de iniciar o lote.
- Incluir **Padrão do provedor**, que significa omitir o parâmetro. Não confundir essa opção com “sem raciocínio”.
- Mostrar somente os níveis suportados pelo modelo selecionado. Usar nomes em português/inglês e guardar o valor técnico correspondente.
- Para ChatGPT, encaminhar `reasoning.effort` na Responses API. Para Gemini, usar o parâmetro nativo de pensamento do modelo e endpoint escolhidos; não assumir equivalência universal entre níveis e budgets.
- JEV continua com seu contrato atual, sem receber parâmetros de raciocínio não documentados.
- Centralizar capacidades em adaptadores, com catálogo de conta quando houver informação suficiente e tabela explícita/testada para modelos conhecidos. Modelo desconhecido oferece “Padrão” até haver suporte confirmado.
- Trocar o modelo valida novamente a opção anterior e informa quando for necessário escolher outra. Não fazer downgrade silencioso nem repetir chamadas sem o parâmetro após erro.
- Configurações antigas permanecem em “Padrão do provedor”. Não alterar retrospectivamente o comportamento de projetos existentes.
- O usuário pode escolher baixo para experimentar menor latência. Não definir baixo automaticamente para todos os filtros nem prometer qualidade equivalente.
- A alteração vale para novas avaliações. Um lote iniciado mantém o esforço capturado, mesmo se o usuário editar as configurações depois.
- Guardar a preferência localmente, por provedor/modelo. Nas sugestões do projeto, registrar esforço solicitado e, quando informado pela API, esforço efetivo; não inventar o valor efetivo quando só houver o padrão.
- Trocar o esforço não invalida automaticamente uma sugestão válida pelos mesmos critérios/texto. Mostrar sua origem e oferecer reavaliação explícita.

## 5. Preservar “Revisão manual”

### Estados e regras

Manter separados: status decidido pelo usuário, sugestão da IA e resultado técnico da tentativa de avaliação.

| Situação | Resultado esperado |
| --- | --- |
| Resposta válida e inconclusiva | `uncertain`, disponível em Revisão manual; status humano preservado |
| Modelo informa evidência insuficiente para um critério obrigatório | Abstenção explícita; não gerar decisão aplicável automaticamente |
| Sugestão válida de incluir/excluir abaixo do limiar do lote | Manter sugestão e indicar necessidade de conferência; não aplicar em lote |
| Texto necessário indisponível | `needs-text`, em Sem texto; não simular uma avaliação |
| Probabilidade ausente, null, textual, inválida ou fora da faixa | Erro de avaliação, artigo permanece pendente; oferecer nova tentativa e revisão humana |
| Timeout, recusa do modelo ou resposta truncada | Erro/recusa identificável, sem inclusão ou exclusão substituta |
| Decisão manual durante a execução | Preservar a decisão e seus critérios; impedir aplicação posterior sobre esse status |
| Sugestão anterior válida e nova tentativa falha | Preservar sugestão anterior e mostrar separadamente a falha da tentativa recente |

Os cartões devem dizer **Sugestão: incluir/excluir** se contarem decisões propostas. O resumo de aplicação mostra separadamente quantas podem ser aplicadas e quantas continuarão pendentes para conferência. Não renomear o cartão de inconclusivos de maneira que altere seu significado sem explicar a mudança.

Manter os atalhos, filtros e ações existentes de revisão humana. Permitir acessar erros e sugestões abaixo do limiar sem confundi-los com os inconclusivos. Falha técnica não deve virar um `uncertain` apresentado como avaliação bem-sucedida.

### Respostas estruturadas e o erro da imagem

1. Definir contrato interno versionado para respostas dos adaptadores, com todos os IDs de critérios esperados e abstenção explícita quando suportada.
2. Pedir saída estruturada por schema nos provedores/modelos que a suportem, validando a compatibilidade com as rotas autenticadas utilizadas.
3. Validar completude, tipos, intervalos e níveis de qualidade antes de chamar `decide`. JSON sintaticamente válido não comprova avaliação completa ou correta.
4. Nunca preencher silenciosamente um critério ausente com 0, 0,5 ou 1, converter percentuais sem contrato explícito ou truncar valores para caber na faixa.
5. Retirar a equivalência implícita entre “sem evidência” e probabilidade 0,5 no prompt dos provedores generativos. Registrar a abstenção separadamente, sem presumir que todo 0,5 válido significa abstenção.
6. Recalcular com regras atuais sem perder o marcador de abstenção: `withCurrentRules`, `isAutoApplicable`, filtros e aceitação individual precisam respeitá-lo.
7. Guardar diagnóstico limitado: artigo/filtro, provedor/modelo, código do erro, critério problemático, tipo recebido, instante e request ID disponível. Não registrar tokens ou texto integral dos artigos como rotina.
8. Mostrar “Resposta inválida no critério I1; o artigo continua pendente” em vez de expor apenas a mensagem técnica.
9. Oferecer repetição apenas dos itens com erro, por ação explícita. Retentativas transitórias devem ser limitadas e respeitar `Retry-After`; sem ciclos ilimitados para erro de schema, autenticação ou cota.
10. Não reclassificar resultados históricos por causa da imagem. Auditar uma amostra e os diagnósticos antes de concluir que houve viés ou erro de regra.

## 6. Integração removida

O suporte ao Gemini foi removido a pedido do usuário em 28/10/2026.
O aplicativo oferece JEV e ChatGPT. Não há configuração OAuth Google,
rotas ou dependências de inferência Google. Registros anteriores deste plano
permanecem como histórico; não representam integração disponível.

## 7. Divisão técnica proposta

| Área | Mudança futura |
| --- | --- |
| `src/ai/` | Controlador central de lote, adaptadores por provedor, capacidades de modelo e contrato validado |
| `src/App.jsx` | Montagem estável do controlador, identificação da sessão do projeto e gravação protegida dos resultados |
| Modal atual e novo painel compacto | Exibir a mesma execução; separar minimizar, expandir, interromper e fechar resumo |
| Configurações de IA | Provedor/modelo/esforço, conexão Google, resumo de parâmetros e concorrência acessível para cada provedor |
| `server/` | Encaminhamento de esforço, contrato de respostas, OAuth Gemini e isolamento de credenciais |
| `screening.js` e painel/lista de sugestões | Abstenção, validação completa, revisão humana e manutenção das regras existentes |
| `fileSystem.js` e exportação | Metadados compatíveis de sugestão/tentativa; migração somente se o formato persistido exigir |
| `pt.json` / `en.json` | Textos e estados novos, incluindo explicações de erro |

Revalidar os arquivos antes de implementar. Evitar reestruturar todo o aplicativo para obter um controlador estável.

## 8. Ordem de implementação futura

1. Criar testes de caracterização das regras atuais, revisão manual e aplicação em lote; definir contrato de abstenção/erro.
2. Resolver a validação de respostas e os estados de revisão, com regressão de JEV/ChatGPT.
3. Extrair o controlador de lote, proteger projeto/decisões posteriores e conectar minimizar/expandir.
4. Acrescentar esforço configurável e rastreabilidade, preservando o padrão atual de configurações antigas.
5. Validar o acesso OAuth Google e implementar o adaptador Gemini usando o contrato já testado.
6. Integrar traduções, exportação, persistência e mensagens de consumo.
7. Verificar fluxo completo e medir latência/qualidade em uma amostra autorizada antes de recomendar esforço menor para todos os artigos.

## 9. Verificação e critérios de aceite

- Minimizar/expandir repetidamente não altera chamadas, consumo, contadores nem resultados.
- Navegar pelos filtros, estatísticas e protocolo mantém o mesmo lote/filtro de origem; abrir outro projeto cancela e impede gravações tardias.
- Interromper durante requisição ou flush não duplica sugestões nem consumo; erros isolados não perdem os sucessos anteriores.
- Editar manualmente um artigo enquanto o lote roda preserva status, critérios e origem humana. Aplicar sugestões exige confirmação e revalidação no clique.
- Resposta incompleta, null, string, fora da faixa, recusa ou sem evidência nunca resulta em exclusão automática por valor presumido.
- `uncertain`, Sem texto, erros e sugestões abaixo do limiar permanecem acessíveis com contagens coerentes; incluir e excluir manualmente continua funcionando sem conexão com IA.
- Recalcular regras ou salvar/reabrir não perde abstenção, diagnóstico da tentativa e origem da sugestão. Arquivos antigos permanecem legíveis.
- Esforço escolhido chega ao provedor na avaliação individual, no teste de conexão e no lote. Opções incompatíveis são impedidas antes do envio.
- Trocar modelo/provedor/esforço durante um lote não altera sua configuração capturada. JEV não recebe parâmetros de outro provedor.
- Gemini: login, negação de consentimento, renovação, desconexão, listagem de modelos, inferência estruturada, cancelamento e erros de cota/rede com testes simulados; teste real depende de conta/projeto autorizados.
- Interface em português/inglês, tema claro/escuro, teclado e tela pequena. Painel compacto não oculta ações essenciais.
- Medir tempo por artigo, mediana/p95, tokens disponíveis, falhas, inconclusivos e concordância com revisão humana. Menor tempo sozinho não comprova melhor configuração.
- Executar os testes existentes e novos, build e lint. Registrar diferenças contra a situação anterior, sem atribuir falhas preexistentes às novas mudanças.

## 10. Fontes para revalidar na implementação

- [OpenAI: esforço de raciocínio e compatibilidade por modelo](https://developers.openai.com/api/docs/guides/reasoning).
- [Google: autenticação OAuth na Gemini API](https://ai.google.dev/gemini-api/docs/oauth).
- [Google: parâmetros de pensamento por modelo](https://ai.google.dev/gemini-api/docs/thinking).
- [Google: respostas estruturadas com JSON Schema](https://ai.google.dev/gemini-api/docs/structured-output).
- [Google: cotas e cobrança da API](https://ai.google.dev/gemini-api/docs/billing/).

As APIs e os catálogos podem mudar. Usar a documentação vigente e a configuração real da conta ao implementar, sem fixar compatibilidade apenas pelo nome comercial do modelo.

## 11. Evidência adicional: comparação dos projetos GPT/JEV

Análise offline em 28/10/2026, registrada em [comparacao-gpt-jev.md](../benchmark/results/comparacao-gpt-jev.md), com comparação artigo a artigo no JSON de mesmo nome. Nenhuma sugestão ou decisão dos projetos foi alterada.

- Os dois projetos avaliam os mesmos 1433 artigos, com os mesmos campos de entrada, critérios e regras. GPT-6 Luna sugere excluir todos; JEV sugere incluir 9, excluir 1388 e revisar 36.
- Na referência manual local `revisão_sistemática_r3.srp`, validada contra essa população e entradas, há 36 incluídos. GPT sugere excluir os 36; JEV inclui 9, sugere excluir 22 e deixa 5 inconclusivos.
- Com o limiar atual de 95%, GPT tornaria 1415 exclusões elegíveis em lote, atingindo 21 dos 36 incluídos humanos. JEV tornaria 148 exclusões elegíveis, sem atingir os incluídos humanos. Elegibilidade calculada não significa que as decisões tenham sido aplicadas: todos continuam pendentes nos arquivos comparados.
- E4 aparece em exatamente 50% em 1307 avaliações GPT, mas é o único gatilho de exclusão em apenas 7. Remover E4 da combinação recupera esses 7; os outros 1426 continuam com sugestão de exclusão.
- E3 aciona exclusão em 1418 avaliações GPT e está em exatamente 99% em 1238. Logo, corrigir E4 ou apenas diminuir esforço não basta: revisar abstenção, interpretação I1/E3 e validação dos limiares por provedor.
- Preservar os dois projetos e a referência como casos de regressão, mantendo a distinção entre sugestões, revisão e aplicação em lote. Reavaliar somente uma amostra autorizada antes de propor uso amplo de exclusões GPT.


## 12. Registro da implementação e verificação

Atualização posterior da inclusão no Filtro 1 (28/10/2026): quando todos os
critérios de inclusão forem avaliados e atenderem ao limiar configurado e as
exclusões avaliadas ficarem abaixo de 0,5, verificações de exclusão pendentes
permitem sugestão de inclusão para avançar na triagem. O campo
`provisionalInclusion` registra essa condição. O aviso mantém as pendências
visíveis; elas continuam nulas, não representam evidência negativa. A aceitação
é explícita e a aplicação automática continua bloqueada. Critérios de inclusão
não avaliados, citações rejeitadas e pendências nos Filtros 2/3 continuam
exigindo revisão manual. Esta atualização substitui os bloqueios gerais de
inclusão descritos nos registros históricos abaixo. Validação: 42 testes
aprovados, incluindo o exemplo I1=96%, E1/E2/E5=1%, E3=2% e E4 não verificado,
recálculo, limiar personalizado, aceitação e bloqueio da aplicação automática.

Atualização da regra solicitada em 28/10/2026: um critério de exclusão avaliado
com probabilidade >= 0,5 é suficiente para sugerir exclusão, mesmo com outros
critérios não verificados. A sugestão pode ser aceita explicitamente; os motivos
registrados são somente os critérios avaliados que sustentam a exclusão.
Critérios desconhecidos continuam nulos e visíveis; impedem inclusão e aplicação
automática em lote. Esta regra substitui, nos registros anteriores abaixo, a
abstenção obrigatória de toda sugestão quando qualquer critério era desconhecido.
O recálculo usa os valores já salvos, sem nova consulta ao provedor.
Validação desta atualização: 44 testes aprovados, incluindo os três filtros,
aceitação explícita, preservação de decisões humanas e mensagens PT/EN.

### Entrega

- Controlador em `src/ai/evaluationController.js`, montado no estado central com `useSyncExternalStore`, com snapshot por lote, conexão vinculada, cancelamento, gravação periódica e descarte de retornos tardios.
- Modal e painel compacto em `JevBatchModal.jsx`, com minimizar/expandir/interromper separados, contagem conservada por estado, resumo, erros e nova tentativa somente dos itens com falha.
- Contrato v2 em `answerContract.js`: respostas completas, evidência citada do texto ou abstenção explícita. Ausência, null ou string não são convertidos em 50%. A evidência deve constar dos campos fornecidos; isso valida a origem do trecho, mas não comprova a correção semântica da conclusão.
- `screening.js`, `evaluationState.js` e `App.jsx` preservam decisões humanas e sugestões anteriores, distinguem erros/inconclusivos/Sem texto, verificam hashes dos campos efetivamente enviados e revalidam a aplicação no estado atual.
- Os critérios obrigatórios não verificados mantêm a sugestão inconclusiva, mesmo com alta probabilidade em outros critérios. Portanto, um E4 que dependa de verificação externa ainda pode exigir revisão manual em todo o lote; não foi substituído por um valor arbitrário.
- Sugestões generativas históricas não são reclassificadas. Exigem reavaliação antes da aceitação/aplicação assistida; a classificação manual permanece disponível.
- Esforço por provedor/modelo em `modelCapabilities.js` e nas configurações de IA. O padrão omite o parâmetro; modelo desconhecido não recebe valores presumidos. O lote mantém sua escolha inicial.
- Gemini OAuth em `server/geminiService.js`, com biblioteca oficial `google-auth-library`, PKCE, verificação de identidade/nonce, permissões, renovação em memória, catálogo e `generateContent` com schema. Integração posteriormente removida a pedido do usuário.
- Retentativas transitórias limitadas e canceláveis. `Retry-After` longo devolve o erro ao usuário sem repetir prematuramente. Cota/permissão esgotada interrompe a fila em vez de enviar os demais artigos.
- Projeto no formato 1.5.0, com migração compatível dos formatos anteriores e preservação do histórico de score zero. A nova versão evita que leitores antigos interpretem a abstenção como uma probabilidade comum.
- Exportação inclui provedor/modelo, esforço solicitado/efetivo quando disponível, critérios não verificados e erro da última tentativa. Consumo por provedor/modelo e duração das consultas permitem comparar execuções futuras.

### Validação

- `npm.cmd test`: **34 testes aprovados**, incluindo regressão dos dois benchmarks, abstenção no E4, contratos inválidos, fila minimizada, cancelamento, conflitos, troca de projeto/conexão, OAuth e renovação Google simulados, isolamento dos provedores, persistência e renderização PT/EN dos novos controles.
- `npm.cmd run build -- --configLoader runner`: aprovado. O carregador runner evita a restrição de leitura de diretórios ancestrais no ambiente.
- Lint: **104 erros e 47 avisos**, contra 104 erros e 48 avisos no início desta implementação. Nenhuma nova ocorrência de regra introduzida; os problemas preexistentes continuam fora deste escopo.
- `git diff --check`: aprovado para as alterações.
- Não houve chamadas de inferência reais nesta implementação. Compatibilidade efetiva da conta Google/rotas e qualidade/latência do novo prompt ainda dependem da configuração do usuário e de uma amostra autorizada. Não afirmar que as exclusões do GPT se tornaram corretas sem essa comparação.
- A verificação visual interativa em navegador, teclado e telas pequenas permanece pendente. A renderização automatizada dos componentes confirma estrutura, traduções e ações exibidas, mas não equivale a uma conferência visual completa.

### Correção após relato de erros no E5 (28/10/2026)

- O relato identificou E5, mas o diagnóstico anterior guardava apenas o critério e o tipo do valor. Não é possível determinar retroativamente a causa dos 38 erros pela mensagem genérica.
- O schema agora usa alternativas exclusivas por estado: `assessed` exige número e citação; `insufficient-evidence` exige valor e evidência nulos. Antes, o schema permitia combinações que o validador rejeitava. Estrutura documentada por [OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs) e [Google](https://ai.google.dev/gemini-api/docs/structured-output).
- Citação não encontrada em um campo individual do estudo descarta apenas o valor daquele critério e registra abstenção com motivo `evidence-not-found`. O artigo fica inconclusivo, com aviso explícito e sem aceitação/aplicação pela IA. Os demais valores válidos permanecem disponíveis para a revisão humana.
- Comparação da citação tolera Unicode equivalente, aspas tipográficas e espaços; não usa correspondência semântica, não aceita paráfrases e não concatena campos distintos para construir uma evidência.
- Respostas ausentes, estado inválido, probabilidade/pontuação inválida, abstenção inconsistente e citação vazia/inválida continuam sendo erros. O motivo específico atravessa servidor, cliente, registro da tentativa e mensagem PT/EN, sem armazenar a resposta bruta.
- `npm.cmd test`: **39 testes aprovados**, incluindo E5, dupla validação servidor/cliente, recálculo, bloqueio da aplicação, preservação manual, diagnóstico persistido e renderização dos avisos. Build aprovado; lint dos arquivos envolvidos aprovado. Não houve consulta real ao GPT/Gemini; confirmar a taxa de falhas em uma nova amostra.
- Para usar a correção, interromper/salvar o lote atual, reiniciar o serviço local, recarregar o aplicativo e repetir os itens com erro. Erros históricos não são reinterpretados nem apagados automaticamente.
