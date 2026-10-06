# Designações do Júri (dpejurix)

Microsite para organizar os júris, as habilitações dos defensores e a ordem de designação.
Substitui a planilha de controle mensal por telas simples:

- **Painel**: total de júris realizados, em andamento e concluídos. Abaixo, todos os defensores com júris realizados, júris futuros e tempo de DPE. Clique no nome para abrir o perfil.
- **Júris**: registre o número do processo, a comarca, o número SEI (e SEI complementar), a data, as vagas e a situação. Depois habilite os defensores inscritos.
- **Habilitação**: para cada defensor habilitado o site calcula a distância da cidade de origem até a rodoviária da comarca, mostra o link da rota no Google Maps e classifica automaticamente:
  1. quem fez o **art. 422** naquele júri tem prioridade;
  2. menor distância;
  3. menos júris realizados;
  4. menos júris futuros designados;
  5. maior tempo de DPE (antiguidade), quando a data de ingresso estiver preenchida.

  Com vagas informadas, os primeiros ficam no resultado e os demais como suplentes. O botão "Designar os N primeiros" marca os designados; também dá para marcar ou desmarcar à mão, registrar desistência e informar a quilometragem manualmente.
- **Perfil do defensor**: indicadores, todas as habilitações (data em que foi habilitado, processo, comarca, se fez o art. 422, posição e resultado) e os dados cadastrais (origem, data de ingresso na DPE, júris realizados antes do sistema).

## Como usar

Abra `index.html` no navegador, ou publique a pasta no GitHub Pages (Settings → Pages → branch). Não precisa de servidor nem instalação.

Os dados ficam guardados **no navegador** de quem usa. Em **Configurações** há:
- backup (.json) para salvar e levar os dados para outro computador;
- exportação dos júris para Excel (.csv);
- campo para a chave da API do Google Maps.

## Distâncias

- Com chave do Google Maps (Maps JavaScript API), a quilometragem vem do Google.
- Sem chave, o site calcula a rota de carro pelo OpenStreetMap (OSRM).
- Se nenhum dos dois responder, usa uma estimativa (linha reta × 1,3), sinalizada na tabela.
- Distâncias calculadas ficam guardadas por par origem → comarca.

## Dados iniciais

- `js/defensores-iniciais.js`: os 54 defensores e cidades de origem do relatório de rotas. A data de ingresso na DPE fica vazia até a lista de antiguidade ser enviada.
- `js/municipios.js`: coordenadas da sede dos 417 municípios da Bahia (IBGE) e de Brasília/DF.
- Nenhum registro da planilha de controle foi importado; dela foram aproveitadas só as colunas e as listas de opções (situação do júri, fundamento).
