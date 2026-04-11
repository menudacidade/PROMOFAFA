-- ============================================================
-- PROMOCITY - STORED PROCEDURES PARA CONTADOR DE LIKES
-- Execute este script no SQL Editor do Supabase (Dashboard)
-- Resolve a race condition no likes_count
--
-- Depende de public.promotions com coluna likes_count (bigint/int).
-- Se sua tabela de promoções tiver outro nome, ajuste as funções abaixo.
-- ============================================================

-- Incrementa likes_count de forma atômica e retorna o novo valor
CREATE OR REPLACE FUNCTION public.increment_likes(promo_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_count integer;
BEGIN
    UPDATE public.promotions
    SET likes_count = GREATEST(COALESCE(likes_count, 0) + 1, 0)
    WHERE id = promo_id
    RETURNING likes_count INTO new_count;

    RETURN COALESCE(new_count, 0);
END;
$$;

-- Decrementa likes_count de forma atômica (nunca vai abaixo de 0) e retorna o novo valor
CREATE OR REPLACE FUNCTION public.decrement_likes(promo_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_count integer;
BEGIN
    UPDATE public.promotions
    SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
    WHERE id = promo_id
    RETURNING likes_count INTO new_count;

    RETURN COALESCE(new_count, 0);
END;
$$;

-- Permissões para usuários autenticados chamarem as funções via RPC
GRANT EXECUTE ON FUNCTION public.increment_likes(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_likes(bigint) TO authenticated;
