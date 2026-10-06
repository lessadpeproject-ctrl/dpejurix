# Designações do Júri (dpejurix)

Microsite para organizar os júris, as habilitações dos defensores e a ordem de designação.
Substitui a planilha de controle mensal por telas simples:

- **Painel**: total de júris realizados, em andamento e concluídos. Abaixo, todos os defensores com júris realizados, júris futuros e tempo de DPE. Clique no nome para abrir o perfil.
- **Júris**: registre o número do processo, a comarca, o número SEI (e SEI complementar), a data, as vagas e a situação. Depois habilite os defensores inscritos: a lista mostra nome, cidade e distância aproximada, e dá para marcar vários de uma vez.
- **Habilitação**: para cada defensor habilitado o site calcula a distância da rodoviária da cidade de origem até a rodoviária da comarca, mostra o link da rota no Google Maps e classifica automaticamente:
  1. quem fez o **art. 422** naquele júri tem prioridade;
  2. menor distância;
  3. menos júris realizados;
  4. menos júris futuros designados;
  5. maior tempo de DPE (antiguidade), quando a data de ingresso estiver preenchida.

  Com vagas informadas, os primeiros ficam no resultado e os demais como suplentes. O botão "Designar os N primeiros" marca os designados; também dá para marcar ou desmarcar à mão, registrar desistência e informar a quilometragem manualmente.
- **Perfil do defensor**: indicadores, todas as habilitações (data em que foi habilitado, processo, comarca, se fez o art. 422, posição e resultado) e os dados cadastrais (origem, data de ingresso na DPE, júris realizados antes do sistema).

## Como usar

- **Site:** Netlify, projeto `dpejurix` (https://dpejurix.netlify.app). Estático, sem build (`netlify.toml` publica a raiz).
- **Dados:** Supabase, projeto `dpejurix` (região São Paulo). Tudo fica na tabela `docs` (uma linha por defensor, júri, distância, rodoviária e a configuração).
- **Acesso:** tela de login e senha, sem cadastro nem recuperação de senha. Os usuários ficam na tabela `usuarios` (senha com bcrypt); o login devolve uma sessão que o site envia no cabeçalho `x-sessao`, e as regras de acesso da tabela `docs` só liberam leitura e gravação com sessão válida.
- **Sincronização:** o site confere a cada 10 segundos (e ao voltar para a aba) se algo mudou e recarrega os dados.
- **Chaves do Google:** em Configurações, uma por linha; ficam no banco e são usadas em rodízio (quando uma é recusada ou esgota a cota do dia, passa para a próxima).

Trocar a senha de um usuário (SQL no painel da Supabase):

```sql
update public.usuarios set senha_hash = extensions.crypt('nova-senha', extensions.gen_salt('bf', 10)) where login = 'dpe1@juri';
delete from public.sessoes where login = 'dpe1@juri';  -- desconecta quem estiver usando
```

Em **Configurações** há ainda backup (.json), restauração e exportação dos júris para Excel (.csv).

Sem `js/supabase-config.js`, o site funciona só no navegador de quem usa (modo local).

## Distâncias

- Toda rota sai da **rodoviária** da cidade de origem do defensor e chega à **rodoviária** do município do júri. `js/rodoviarias.js` guarda a localização de cada rodoviária (Google Places), gerada por `tools/localizar_rodoviarias.py`; município sem rodoviária localizada usa a sede.
- A tabela `js/distancias.js` guarda as distâncias de carro calculadas pelo Google Maps (Routes API) de rodoviária a rodoviária. Ela é gerada uma vez por `tools/calcular_distancias.py` e não gasta consultas no uso do dia a dia.
- Para trajetos que não estão na tabela: com chave do Google em Configurações (a chave de demonstração do Google serve), o site localiza as rodoviárias pelo Places API e calcula a rota pela Routes API (computeRoutes), guardando o resultado no navegador; sem chave, usa a rota do OpenStreetMap (OSRM); se nada responder, usa uma estimativa (linha reta × 1,3), sinalizada na tabela.
- O campo "km" de cada habilitado substitui qualquer cálculo.

Para gerar ou atualizar as tabelas (a chave precisa ter **Routes API** e **Places API (New)** ativadas e faturamento ligado no Google Cloud):

```
GOOGLE_MAPS_KEY=sua-chave python3 tools/localizar_rodoviarias.py          # 1º: rodoviárias
GOOGLE_MAPS_KEY=sua-chave python3 tools/calcular_distancias.py            # origens novas
GOOGLE_MAPS_KEY=sua-chave python3 tools/calcular_distancias.py Salvador   # recalcula uma origem
```

## Dados iniciais

- `js/defensores-iniciais.js`: os 54 defensores e cidades de origem do relatório de rotas. A data de ingresso na DPE fica vazia até a lista de antiguidade ser enviada.
- `js/municipios.js`: coordenadas da sede dos 417 municípios da Bahia (IBGE) e de Brasília/DF.
- Nenhum registro da planilha de controle foi importado; dela foram aproveitadas só as colunas e as listas de opções (situação do júri, fundamento).
