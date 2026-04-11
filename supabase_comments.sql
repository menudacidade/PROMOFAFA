-- ============================================================
-- PROMOCITY - COMENTÁRIOS NAS PROMOÇÕES
-- Execute este script no SQL Editor do Supabase (Dashboard)
--
-- ⚠️ Se a tabela de perfil NÃO for public.users, substitua public.users por
--    public.NOME_DA_TABELA em todo este arquivo antes de executar.
-- ============================================================

-- Tabela de comentários (qualquer usuário autenticado pode comentar)
CREATE TABLE IF NOT EXISTS public.comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id bigint NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    text text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_promotion ON public.comments(promotion_id, created_at ASC);

-- RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode ler comentários de qualquer promoção
DROP POLICY IF EXISTS "comments_select_any" ON public.comments;
CREATE POLICY "comments_select_any" ON public.comments
    FOR SELECT TO authenticated
    USING (true);

-- Só pode inserir comentário estando autenticado e como si mesmo
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own" ON public.comments
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Só pode deletar o próprio comentário
DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own" ON public.comments
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- Anônimos não têm acesso (não criamos policy para anon)
