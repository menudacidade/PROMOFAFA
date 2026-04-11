# Notificações – PROMOCITY (In-app + Push)

## 1) Supabase (obrigatório para in-app)

### Executar SQL

1. Supabase Dashboard → **SQL Editor**
2. Copie e execute o conteúdo do arquivo: **`supabase_notifications.sql`**

Isso cria:
- **`notifications`**: notificações do usuário (lida/não lida, ação opcional)
- **`push_tokens`**: tokens para push (OneSignal/FCM)
- RLS/policies para o usuário ver apenas as próprias notificações/tokens

### Realtime (opcional, mas recomendado)

Para badge e lista atualizarem automaticamente:
- Supabase Dashboard → **Database → Replication**
- Habilitar Realtime para **`notifications`**

---

## 2) App (in-app)

### Como funciona

- O botão **🔔** abre um **modal** com a lista de notificações do usuário.
- O sino mostra um **badge** com a quantidade de **não lidas**.
- Ao tocar/abrir uma notificação, ela é marcada como lida.
- Há botões: **Atualizar** e **Marcar todas como lidas**.

### Eventos já gerando notificação (in-app)

No fluxo de entregas, o app já cria notificações quando:
- Comerciante aceita/recusa pedido
- Motoboy aceita entrega
- Motoboy atualiza status (sai para entrega / a caminho / entregue)

---

## 3) Push Notifications (OneSignal)

### O que você precisa fazer

1. Criar conta e App no OneSignal (Web Push)
2. Pegar seu **App ID**
3. Definir o App ID no frontend, antes do `app.init()`.

Opção simples:
- No arquivo `index.html`, antes do `app.js`, crie:

```html
<script>
  window.ONESIGNAL_APP_ID = "SEU-APP-ID-AQUI";
</script>
```

O app, ao logar, tenta:
- Solicitar permissão (se necessário)
- Registrar o token do OneSignal em **`push_tokens`**

### Enviar push por backend (Edge Function – recomendado)

Você pode usar uma **Edge Function do Supabase** para enviar push via API do OneSignal.

**Exemplo de Edge Function** (arquivo `send-push/index.ts`):

```ts
// deno-lint-ignore-file no-explicit-any
import { serve } from \"https://deno.land/std@0.224.0/http/server.ts\";

serve(async (req) => {
  try {
    const { toTokens, title, message, url } = await req.json();
    const ONESIGNAL_APP_ID = Deno.env.get(\"ONESIGNAL_APP_ID\")!;
    const ONESIGNAL_REST_API_KEY = Deno.env.get(\"ONESIGNAL_REST_API_KEY\")!;

    const res = await fetch(\"https://onesignal.com/api/v1/notifications\", {
      method: \"POST\",
      headers: {
        \"Content-Type\": \"application/json\",
        \"Authorization\": `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: toTokens,
        headings: { en: title },
        contents: { en: message },
        url: url || undefined,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify({ ok: res.ok, data }), {
      headers: { \"Content-Type\": \"application/json\" },
      status: res.ok ? 200 : 400,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      headers: { \"Content-Type\": \"application/json\" },
      status: 500,
    });
  }
});
```

#### Variáveis de ambiente no Supabase

No Supabase Dashboard → **Project Settings → Edge Functions → Environment Variables**:
- `ONESIGNAL_APP_ID`
- `ONESIGNAL_REST_API_KEY`

#### Como disparar

Quando acontecer um evento (ex.: pedido aceito), você pode:
1. Buscar os tokens do usuário em `push_tokens`
2. Chamar a Edge Function passando `toTokens`, `title`, `message`, `url`

---

## 4) Arquivos alterados no projeto

- `index.html`: modal de notificações + badge no sino + script OneSignal
- `css/style.css`: estilos do modal/lista/badge
- `js/database.js`: CRUD de `notifications` e `push_tokens`
- `js/ui.js`: renderização e badge
- `js/app.js`: listeners do sino, carregar/marcar lida, Realtime e OneSignal init

