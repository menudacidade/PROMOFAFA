# Instruções – Entregas e Motoboys (PROMOCITY)

## O que foi implementado

- **Cliente:** botão "Pedir com entrega" nas promoções, endereço (ou localização atual), taxa de entrega, confirmação do pedido e acompanhamento do status e da localização do motoboy em tempo real.
- **Comerciante:** tela "Pedidos de entrega" no perfil, aceitar ou recusar pedidos e acompanhar a entrega.
- **Motoboy:** ativação no perfil (escolha do veículo: moto, bike, carro), dashboard com abas "Disponíveis", "Em andamento" e "Histórico", aceitar entrega, atualizar status (Sai para entrega, A caminho, Entregue) e compartilhar localização em tempo real.

---

## O que você precisa fazer no Supabase

### 1. Executar o SQL

1. Acesse o **Dashboard do Supabase** do seu projeto.
2. Vá em **SQL Editor**.
3. Abra o arquivo **`supabase_delivery.sql`** do projeto e copie todo o conteúdo.
4. Cole no editor SQL e execute (**Run**).

Isso vai:

- Adicionar colunas na tabela **users**: `is_motoboy`, `motoboy_vehicle`, `motoboy_available`, `motoboy_lat`, `motoboy_lng`, `motoboy_updated_at`.
- Criar as tabelas **deliveries**, **delivery_locations** e **delivery_ratings**.
- Criar índices e trigger de `updated_at`.
- Configurar **RLS (Row Level Security)** e políticas para clientes, comerciantes e motoboys.

### 2. Habilitar Realtime (opcional, para atualizações em tempo real)

Para que o status da entrega e a localização do motoboy atualizem em tempo real para cliente e comerciante:

1. No Dashboard do Supabase, vá em **Database** → **Replication**.
2. Ative a replicação para as tabelas:
   - **deliveries**
   - **delivery_locations**

Se a opção **Replication** não aparecer ou for diferente na sua versão, use o SQL (no SQL Editor), se o seu projeto permitir:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_locations;
```

Se der erro (por exemplo, publicação não existir), ignore e use apenas o fluxo sem Realtime (atualizar a tela manualmente).

### 3. Conferir a tabela `users`

Depois de rodar o `supabase_delivery.sql`, a tabela **users** deve ter as novas colunas. Se você já tinha uma tabela **users** criada por outro script, o `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` evita erro; as colunas novas são só adicionadas.

---

## Fluxo resumido

1. **Cliente** vê uma promoção → "Pedir com entrega" → informa endereço (ou "Usar minha localização") → vê taxa e total → confirma. O pedido fica com status "Aguardando comerciante".
2. **Comerciante** em Perfil → "Pedidos de entrega" → aceita ou recusa. Ao aceitar, status vai para "Aguardando motoboy".
3. **Motoboy** em Perfil → ativa "Disponível para entregas" → "Ver entregas" → aba "Disponíveis" → aceita uma entrega → em "Em andamento" abre "Ver detalhes" → "Sai para entrega" → "A caminho do cliente" → "Compartilhar localização" (opcional) → "Marcar como entregue".
4. **Cliente** e **comerciante** podem acompanhar em "Acompanhar entrega" (quando o status for "Motoboy pegou" ou "A caminho"), com mapa mostrando retirada, destino e posição do motoboy (quando houver localização compartilhada).

---

## Arquivos alterados ou criados

- **supabase_delivery.sql** – script para rodar no Supabase (novas colunas e tabelas de entregas).
- **index.html** – telas: pedido com entrega, dashboard motoboy, pedidos do comerciante, rastreio, detalhe da entrega, meus pedidos (cliente), modal de escolha de veículo.
- **css/style.css** – estilos das telas e componentes de entrega.
- **js/database.js** – funções de entregas (criar pedido, listar por cliente/merchant/motoboy, aceitar, status, localização, Realtime, avaliação).
- **js/utils.js** – `getDistanceKm` e `calculateDeliveryFee`.
- **js/ui.js** – referência às novas telas, botão "Pedir com entrega" no card, seção motoboy e comerciante no perfil, renderização das listas e detalhes de entrega.
- **js/app.js** – fluxos de pedido, motoboy (ativar, dashboard, aceitar, status, compartilhar localização), comerciante (aceitar/recusar), rastreio e meus pedidos.
- **js/auth.js** – `isMotoboy()`.
- **js/map.js** – `initDeliveryTrackingMap` para o mapa de rastreio.

Nenhuma pasta nova foi criada; tudo foi integrado na estrutura atual do projeto.
