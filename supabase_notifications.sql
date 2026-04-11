-- ============================================================
-- PROMOCITY - NOTIFICAÇÕES (IN-APP + PUSH TOKENS)
-- Execute este script no SQL Editor do Supabase (Dashboard)
--
-- ⚠️ Se a tabela de perfil NÃO for public.users, substitua public.users por
--    public.NOME_DA_TABELA em todo este arquivo (incl. policies no final).
-- ============================================================

-- 1) Tabela de notificações in-app
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    action_url text,
    action_label text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);

-- 2) Tabela de tokens de push (OneSignal/FCM, etc.)
CREATE TABLE IF NOT EXISTS public.push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'onesignal' CHECK (provider IN ('onesignal','fcm')),
    token text NOT NULL,
    device_info jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, provider, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_active ON public.push_tokens(user_id, is_active);

-- Trigger updated_at para push_tokens
CREATE OR REPLACE FUNCTION public.set_push_tokens_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_push_tokens_updated ON public.push_tokens;
CREATE TRIGGER trigger_push_tokens_updated
    BEFORE UPDATE ON public.push_tokens
    FOR EACH ROW EXECUTE FUNCTION public.set_push_tokens_updated_at();

-- 3) RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- notifications: usuário só vê/atualiza as próprias
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

-- INSERT: próprio usuário OU notificação para outro (story/promo/entregas). Autenticado pode criar para qualquer user_id.
DROP POLICY IF EXISTS "notifications_insert_server_or_self" ON public.notifications;
CREATE POLICY "notifications_insert_server_or_self" ON public.notifications FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        OR (user_id IS NOT NULL AND user_id != auth.uid())
    );

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);

-- push_tokens: usuário só vê/insere/atualiza os próprios tokens
DROP POLICY IF EXISTS "push_tokens_select_own" ON public.push_tokens;
CREATE POLICY "push_tokens_select_own" ON public.push_tokens FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_tokens_upsert_own" ON public.push_tokens;
CREATE POLICY "push_tokens_upsert_own" ON public.push_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_tokens_update_own" ON public.push_tokens;
CREATE POLICY "push_tokens_update_own" ON public.push_tokens FOR UPDATE
    USING (auth.uid() = user_id);

-- 4) Função para inserir notificação (contorna RLS - usada em story/promo)
CREATE OR REPLACE FUNCTION public.insert_notification_for_user(
    p_user_id uuid,
    p_title text,
    p_message text,
    p_action_url text DEFAULT NULL,
    p_action_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_id uuid;
BEGIN
    INSERT INTO public.notifications (user_id, title, message, action_url, action_label)
    VALUES (p_user_id, p_title, p_message, NULLIF(TRIM(p_action_url), ''), NULLIF(TRIM(p_action_label), ''))
    RETURNING id INTO new_id;
    RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_notification_for_user(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_notification_for_user(uuid, text, text, text, text) TO service_role;

-- 5) Realtime (opcional)
-- No Dashboard do Supabase: Database > Replication > habilite notifications (e opcionalmente push_tokens)

-- 6) USUÁRIOS: permitir que autenticados leiam o id dos outros (para notificações de novo story/promo)
-- Necessário para o app listar user_id de todos e enviar notificação quando alguém publica story ou promoção.
-- Se a tabela users já tiver RLS, adicione esta policy; se não tiver RLS, o SELECT já funciona e pode pular.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
        ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP POLICY IF EXISTS "users_select_id_authenticated" ON public.users;
CREATE POLICY "users_select_id_authenticated" ON public.users
    FOR SELECT
    TO authenticated
    USING (true);

-- Nota: se já existir uma policy de SELECT em users que restrinja a apenas o próprio usuário,
-- pode ser necessário removê-la ou ajustar. Esta policy permite que qualquer usuário autenticado
-- leia todas as linhas (o app usa apenas a coluna id para notificações em massa).

