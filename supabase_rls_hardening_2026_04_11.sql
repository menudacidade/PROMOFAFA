-- ============================================================
-- PROMOCITY — Hardening de RLS e Segurança
-- migration 2026-04-11
-- Execute no SQL Editor do Supabase Dashboard.
-- ============================================================

-- ==================================================
-- A4: Policies de promotions (defesa em profundidade)
-- O código JS também já filtra por author_id, mas o RLS
-- é a última linha de defesa no banco de dados.
-- ==================================================

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode ler promoções (feed público)
DROP POLICY IF EXISTS "promotions_select_all_authenticated" ON public.promotions;
CREATE POLICY "promotions_select_all_authenticated" ON public.promotions
    FOR SELECT
    TO authenticated
    USING (true);

-- Anônimos também podem ler (para deep links sem login)
DROP POLICY IF EXISTS "promotions_select_anon" ON public.promotions;
CREATE POLICY "promotions_select_anon" ON public.promotions
    FOR SELECT
    TO anon
    USING (true);

-- Apenas comerciantes inserem suas próprias promoções
DROP POLICY IF EXISTS "promotions_insert_own_merchant" ON public.promotions;
CREATE POLICY "promotions_insert_own_merchant" ON public.promotions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = author_id
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.user_type = 'merchant'
        )
    );

-- Apenas o autor edita sua própria promoção
DROP POLICY IF EXISTS "promotions_update_own" ON public.promotions;
CREATE POLICY "promotions_update_own" ON public.promotions
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = author_id)
    WITH CHECK (auth.uid() = author_id);

-- Apenas o autor deleta sua própria promoção
DROP POLICY IF EXISTS "promotions_delete_own" ON public.promotions;
CREATE POLICY "promotions_delete_own" ON public.promotions
    FOR DELETE
    TO authenticated
    USING (auth.uid() = author_id);

-- ==================================================
-- A5: Reescrita das policies de deliveries
-- Substitui a policy UPDATE ampla (qualquer autenticado
-- quando status=accepted_merchant e motoboy_id IS NULL)
-- por policies segregadas por papel/estado.
-- ==================================================

-- Remove policies antigas
DROP POLICY IF EXISTS "deliveries_update_merchant_motoboy"  ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_update_merchant"          ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_update_motoboy"           ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_update_accept"            ON public.deliveries;

-- Policy 1: Comerciante aceita/recusa pedido
--   Só age quando o pedido ainda está em pending_merchant.
CREATE POLICY "deliveries_update_merchant" ON public.deliveries
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = merchant_id
        AND status = 'pending_merchant'
    )
    WITH CHECK (auth.uid() = merchant_id);

-- Policy 2: Motoboy atribui a si mesmo (apenas se is_motoboy = true)
--   Permite somente quando status=accepted_merchant e motoboy_id ainda é NULL.
--   Checa is_motoboy na tabela de perfil para evitar que qualquer autenticado se atribua.
CREATE POLICY "deliveries_update_accept_motoboy" ON public.deliveries
    FOR UPDATE
    TO authenticated
    USING (
        status = 'accepted_merchant'
        AND motoboy_id IS NULL
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.is_motoboy = true
        )
    )
    WITH CHECK (
        auth.uid() = motoboy_id
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.is_motoboy = true
        )
    );

-- Policy 3: Motoboy atualiza status das suas próprias entregas
--   (picked_up → in_delivery → delivered)
CREATE POLICY "deliveries_update_motoboy_status" ON public.deliveries
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = motoboy_id
        AND status IN ('waiting_motoboy', 'picked_up', 'in_delivery')
    )
    WITH CHECK (auth.uid() = motoboy_id);

-- Policy 4: Cliente pode cancelar seu próprio pedido (se ainda pending_merchant)
CREATE POLICY "deliveries_update_client_cancel" ON public.deliveries
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = client_id
        AND status = 'pending_merchant'
    )
    WITH CHECK (auth.uid() = client_id);

-- ==================================================
-- A6: Segurança da RPC insert_notification_for_user
-- Revoga execução da função para anon (já está implícito
-- com GRANT apenas para authenticated + service_role,
-- mas o REVOKE explícito garante).
-- ==================================================

REVOKE EXECUTE ON FUNCTION public.insert_notification_for_user(uuid, text, text, text, text) FROM anon;

-- Reconfirma permissões corretas (idempotente)
GRANT EXECUTE ON FUNCTION public.insert_notification_for_user(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_notification_for_user(uuid, text, text, text, text) TO service_role;

-- ==================================================
-- A6: Valida que a função existe com SECURITY DEFINER
-- (snippet diagnóstico — execute em separado se quiser verificar)
-- ==================================================
-- SELECT proname, prosecdef, proacl
-- FROM pg_proc
-- WHERE proname = 'insert_notification_for_user';
-- prosecdef = true  →  SECURITY DEFINER  (correto)

-- ==================================================
-- Fim da migration 2026-04-11
-- Após aplicar, revise no Dashboard:
--   Auth → URL Configuration → Redirect URLs:
--     adicione  https://SEU_DOMINIO/reset-password.html
--   Storage → Policies → bucket "avatars":
--     SELECT para anon (sem filtro de linha) — imagens públicas
-- ==================================================
